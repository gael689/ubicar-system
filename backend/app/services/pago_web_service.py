from __future__ import annotations
"""
PagoWebService — el cobro online de punta a punta (ítem 62).

Dos caminos, y la asimetría entre ellos es todo el diseño:

**Al iniciar** (`iniciar_checkout`) se crea la reserva en `pendiente_pago` y
la preferencia de Mercado Pago. El cupo lo sostiene el hold, no la reserva:
`pendiente_pago` no ocupa calendario a propósito, para que un checkout
abandonado no bloquee un auto.

**Al acreditar** (`procesar_webhook`) se confirma. Y acá van las cuatro reglas
de `docs/PLAN_RESERVAS_WEB.md` §6, que no son opcionales:

1. **El webhook es la fuente de verdad, no la vuelta del navegador.** El
   cliente puede cerrar la pestaña y el pago igual entra.
2. **Idempotencia por `payment_id`.** Mercado Pago reintenta: es su
   comportamiento normal. Sin esto, un pago genera dos asientos.
3. **Re-verificar el cupo antes de confirmar.** Entre el checkout y el webhook
   pueden pasar 40 minutos y el hold pudo vencer.
4. **Nunca confiar en el monto que vuelve del navegador.** Se compara contra
   lo que se guardó al crear la preferencia.

La lógica que decide *cuánto* y *qué pasa según el estado* vive en
`domain/pagos_web.py`, en funciones puras. Acá sólo se orquesta.
"""
import logging
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.pagos import get_pasarela
from app.adapters.pagos.interface import IPasarelaPago, PagoExterno
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain import pagos_web as dom
from app.domain.enums import EstadoReserva
from app.models.categoria import Categoria
from app.models.cliente import Cliente
from app.models.hold import Hold
from app.models.pago import Pago
from app.models.pago_web import PagoWeb
from app.models.reserva import Reserva
from app.models.usuario import Usuario
from app.services.configuracion_service import ConfiguracionService
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.disponibilidad_service import DisponibilidadService
from app.services.email_reservas import notificar_reserva_pagada
from app.services.hold_service import HoldService
from app.services.notificacion_service import NotificacionService
from app.services.precio_service import PrecioService
from app.services.reserva_service import ReservaService

logger = logging.getLogger(__name__)


class PagoWebService:
    def __init__(self, db: Session, pasarela: IPasarelaPago | None = None) -> None:
        self.db = db
        # Inyectable: los tests pasan la pasarela falsa y ejercitan el webhook
        # completo sin red.
        self.pasarela = pasarela or get_pasarela()

    # ─── Paso 4 de la web: abrir el checkout ─────────────────────────────────

    def iniciar_checkout(
        self,
        *,
        hold_token: str,
        nombre: str,
        email: str,
        telefono: str,
        dni: str,
        lugar_entrega: str,
        lugar_devolucion: str | None,
        porcentaje_anticipo: int,
        adicionales: list[tuple[int, int]] | None = None,
        fecha_nacimiento: date | None = None,
        notas: str | None = None,
        url_base_web: str | None = None,
        url_webhook: str | None = None,
    ) -> dict:
        """
        Crea la reserva en `pendiente_pago` y devuelve la URL de Checkout Pro.

        **El precio se recalcula acá, del lado del servidor.** Lo que el
        navegador dice que sale el alquiler no se usa para nada: es un
        endpoint público y el monto es exactamente lo que un atacante querría
        manipular.
        """
        dom.validar_porcentaje(porcentaje_anticipo)

        # Lock sobre el hold: serializa los checkouts que compiten por el mismo
        # token. Sin esto, un doble clic en "Pagar" crea dos reservas y dos
        # preferencias, porque las dos pasan `vigente_o_error` a la vez.
        self.db.execute(select(Hold.id).where(Hold.token == hold_token).with_for_update())

        hold = HoldService(self.db).vigente_o_error(hold_token)
        categoria = self.db.get(Categoria, hold.categoria_id)
        if categoria is None or not categoria.activo:
            raise NotFoundError("Categoría", hold.categoria_id)

        # ¿Este hold ya abrió un checkout? Pasa con el doble clic y con el
        # botón "atrás" del navegador. Si además eligió lo mismo, se le
        # devuelve la misma preferencia en vez de fabricar una reserva de más.
        en_curso = (
            self.db.query(PagoWeb)
            .filter(PagoWeb.hold_token == hold_token, PagoWeb.estado == "iniciado")
            .order_by(PagoWeb.id.desc())
            .first()
        )
        if (
            en_curso is not None
            and en_curso.porcentaje_anticipo == porcentaje_anticipo
            and en_curso.init_point
        ):
            return self._respuesta_checkout(en_curso)

        cotizacion, categoria_id = PrecioService(self.db).calcular(
            fecha_inicio=hold.fecha_inicio,
            fecha_fin=hold.fecha_fin,
            categoria_id=hold.categoria_id,
            canal="web",
            adicionales=adicionales or [],
            fecha_nacimiento=fecha_nacimiento,
        )
        total = Decimal(str(cotizacion.total))
        anticipo = dom.calcular_anticipo(
            total, porcentaje_anticipo, self._descuento_pago_total()
        )

        # Lo que se guarda en `Reserva.precio_total` es **sólo el vehículo**:
        # los adicionales viven aparte (ver `Reserva.total_adicionales`) y se
        # suman recién al facturar, en `AlquilerService.checkout()`. Guardar
        # acá el total con los adicionales adentro los cobraba dos veces.
        precio_vehiculo = total - Decimal(str(cotizacion.total_adicionales))
        # El descuento por pagar el 100% (D-30) es un descuento real sobre el
        # alquiler: se imputa a la línea del vehículo y se deja el motivo, o
        # `create()` lo rechaza —con razón— como una diferencia sin explicar.
        descuento_d30 = total - Decimal(str(anticipo.total_final))
        precio_reserva = precio_vehiculo - descuento_d30
        motivo_d30 = (
            f"Descuento por pago total del {porcentaje_anticipo}% (D-30)"
            if descuento_d30 > 0
            else None
        )

        cliente = self._cliente_para(nombre, email, telefono, dni, fecha_nacimiento)
        usuario_sistema = self._usuario_sistema()

        # Si el hold ya tenía un checkout abierto y el cliente cambió cuánto
        # quiere adelantar, se reusa **su reserva**: sólo cambia el importe.
        # Crear una segunda dejaría una huérfana en `pendiente_pago`.
        if en_curso is not None:
            en_curso.estado = "rechazado"
            en_curso.detalle = "Reemplazado: el cliente cambió el porcentaje de anticipo"
            reserva = self.db.get(Reserva, en_curso.reserva_id)
        else:
            reserva = None

        if reserva is None:
            reserva, _warnings = ReservaService(self.db).create(
                cliente_id=cliente.id,
                categoria_id=categoria_id,
                fecha_inicio=hold.fecha_inicio,
                hora_inicio=hold.hora_inicio,
                fecha_fin=hold.fecha_fin,
                hora_fin=hold.hora_fin,
                lugar_entrega=lugar_entrega,
                lugar_devolucion=lugar_devolucion or lugar_entrega,
                notas=notas,
                precio_total=precio_reserva,
                descuento_motivo=motivo_d30,
                forma_pago_prevista="mercado_pago",
                adicionales=adicionales or [],
                usuario_id=usuario_sistema.id,
                canal="web",
            )
        else:
            # Reserva reusada: el importe pudo cambiar con el porcentaje.
            reserva.precio_total = precio_reserva
            reserva.descuento_motivo = motivo_d30

        # `create()` la deja en 'pendiente'. La web necesita el estado propio:
        # `pendiente_pago` no ocupa calendario, así que un checkout abandonado
        # no bloquea el auto — lo bloquea el hold, que expira solo.
        reserva.estado = EstadoReserva.PENDIENTE_PAGO.value
        reserva.origen = "web"
        reserva.web_contacto_nombre = nombre
        reserva.web_contacto_email = email
        reserva.web_contacto_telefono = telefono
        self.db.flush()

        pasarela_web = (url_base_web or "").rstrip("/")
        preferencia = self.pasarela.crear_preferencia(
            titulo=f"Reserva {categoria.nombre} — Ubicar Rent",
            monto=anticipo.monto_a_cobrar,
            referencia_externa=dom.referencia_externa(reserva.id),
            email_comprador=email,
            url_exito=f"{pasarela_web}/reservar/listo?status=approved",
            url_pendiente=f"{pasarela_web}/reservar/listo?status=pending",
            url_error=f"{pasarela_web}/reservar/listo?status=failure",
            url_webhook=url_webhook or "",
        )

        pago_web = PagoWeb(
            reserva_id=reserva.id,
            hold_token=hold_token,
            preference_id=preferencia.preference_id,
            init_point=preferencia.init_point,
            monto=anticipo.monto_a_cobrar,
            porcentaje_anticipo=porcentaje_anticipo,
            total_reserva=anticipo.total_lista,
            descuento_pago_total=anticipo.descuento,
            estado="iniciado",
        )
        self.db.add(pago_web)
        self.db.flush()

        return self._respuesta_checkout(pago_web)

    @staticmethod
    def _respuesta_checkout(pago_web: PagoWeb) -> dict:
        """Lo que la web necesita para mandar al cliente a pagar."""
        monto = Decimal(str(pago_web.monto))
        total_final = Decimal(str(pago_web.total_reserva)) - Decimal(
            str(pago_web.descuento_pago_total)
        )
        return {
            "reserva_id": pago_web.reserva_id,
            "pago_web_id": pago_web.id,
            "init_point": pago_web.init_point,
            "preference_id": pago_web.preference_id,
            "monto_a_cobrar": monto,
            "total": total_final,
            "descuento": Decimal(str(pago_web.descuento_pago_total)),
            "saldo": total_final - monto,
        }

    # ─── El webhook ──────────────────────────────────────────────────────────

    def procesar_webhook(self, payment_id: str) -> dict:
        """
        Procesa una notificación de Mercado Pago.

        **Siempre termina en 200 del lado del router**, incluso si acá pasa
        algo raro: un webhook que responde error hace que Mercado Pago
        reintente en bucle. Lo que no se pudo resolver queda en `revision`
        para que lo mire una persona.
        """
        externo = self.pasarela.obtener_pago(payment_id)
        pago_web = self._buscar_pago_web(externo)
        if pago_web is None:
            logger.warning("[MercadoPago] webhook sin PagoWeb: payment_id=%s", payment_id)
            return {"resultado": "ignorado", "motivo": "no corresponde a ninguna reserva"}

        # Regla 2 — idempotencia. Mercado Pago reintenta, y los webhooks pueden
        # llegar desordenados: un `pending` tardío no puede desconfirmar una
        # reserva ya aprobada.
        if dom.ya_procesado(pago_web.estado_externo, externo.estado):
            return {"resultado": "duplicado", "reserva_id": pago_web.reserva_id}

        # Regla 4 — el monto se compara contra lo que pedimos, no contra lo que
        # dice el navegador.
        if not dom.monto_coincide(Decimal(str(pago_web.monto)), externo.monto):
            return self._a_revision(
                pago_web, externo,
                f"El monto acreditado (${externo.monto}) no coincide con el "
                f"solicitado (${pago_web.monto})",
            )

        reserva = self.db.get(Reserva, pago_web.reserva_id)
        if reserva is None:
            return self._a_revision(pago_web, externo, "La reserva ya no existe")

        # Regla 3 — el cupo se re-verifica ahora, no se confía en el hold.
        hay_cupo = self._hay_cupo(reserva, pago_web.hold_token)
        resolucion = dom.resolver(externo.estado, hay_cupo)

        pago_web.payment_id = externo.payment_id
        pago_web.estado_externo = externo.estado
        pago_web.payload = externo.crudo
        pago_web.detalle = resolucion.motivo
        pago_web.procesado_en = datetime.utcnow()
        pago_web.estado = self._estado_interno(externo.estado, resolucion)

        reserva.estado = resolucion.estado_reserva

        if resolucion.acreditar:
            pago = self._acreditar(reserva, pago_web, externo)
            pago_web.pago_id = pago.id
            reserva.estado_pago = dom.estado_pago_reserva(pago_web.porcentaje_anticipo)
            reserva.anticipo_monto = Decimal(str(pago_web.monto))
            reserva.anticipo_fecha = date.today()
            reserva.anticipo_medio_pago = "mercado_pago"

        self._cerrar_hold(pago_web, resolucion)

        # El aviso instantáneo: una reserva web que espera al barrido de las
        # 08:00 es una venta que se cae. Y si entró sin cupo, la notificación
        # sale como crítica (lo decide `avisar_reserva_web` mirando el estado).
        if resolucion.acreditar or resolucion.requiere_persona:
            NotificacionService(self.db).avisar_reserva_web(reserva)
            # Y por mail, al equipo y al cliente. No levanta nunca: que falle
            # un envío no puede tumbar la acreditación de un pago que ya entró.
            notificar_reserva_pagada(self.db, reserva, pago_web)

        self.db.commit()
        return {
            "resultado": "procesado",
            "reserva_id": reserva.id,
            "estado_reserva": reserva.estado,
            "requiere_persona": resolucion.requiere_persona,
        }

    # ─── Piezas internas ─────────────────────────────────────────────────────

    def _descuento_pago_total(self) -> Decimal:
        return ConfiguracionService(self.db).get_decimal(
            dom.CLAVE_DESCUENTO_PAGO_TOTAL, dom.DESCUENTO_PAGO_TOTAL_DEFAULT
        )

    def _buscar_pago_web(self, externo: PagoExterno) -> PagoWeb | None:
        """
        Primero por `payment_id` (un reintento del mismo pago), después por la
        referencia externa (la primera vez que se ve ese pago).

        **Se bloquea la fila** (`FOR UPDATE`). Mercado Pago puede entregar la
        misma notificación dos veces en paralelo: sin el lock, las dos leen
        `estado_externo` en None, las dos pasan el control de idempotencia y
        las dos intentan acreditar. El unique de `payment_id` evitaría el doble
        asiento, pero a costa de una excepción y un webhook perdido — el lock
        hace que la segunda simplemente vea el trabajo ya hecho.
        """
        por_pago = (
            self.db.query(PagoWeb)
            .filter(PagoWeb.payment_id == externo.payment_id)
            .with_for_update()
            .first()
        )
        if por_pago is not None:
            return por_pago

        reserva_id = dom.reserva_de_referencia(externo.referencia_externa)
        if reserva_id is None:
            return None
        return (
            self.db.query(PagoWeb)
            .filter(PagoWeb.reserva_id == reserva_id)
            .order_by(PagoWeb.id.desc())
            .with_for_update()
            .first()
        )

    def _hay_cupo(self, reserva: Reserva, hold_token: str | None) -> bool:
        """
        Regla 3.

        **Se excluye el hold del propio cliente.** En este punto ese hold sigue
        vigente —se consume unas líneas más abajo—, así que contarlo lo haría
        competir contra sí mismo: toda venta de la última unidad terminaría en
        `revision_sin_cupo` en vez de confirmarse.
        """
        if reserva.categoria_id is None:
            return False
        cupos = DisponibilidadService(self.db).consultar(
            reserva.fecha_inicio, reserva.hora_inicio,
            reserva.fecha_fin, reserva.hora_fin,
            categoria_ids=[reserva.categoria_id],
            excluir_hold_token=hold_token,
        )
        disponibles = next(
            (c["disponibles"] for c in cupos if c["categoria_id"] == reserva.categoria_id), 0
        )
        return disponibles >= 1

    @staticmethod
    def _estado_interno(estado_mp: str, resolucion: dom.Resolucion) -> str:
        if resolucion.requiere_persona:
            return "revision"
        if estado_mp == dom.APROBADO:
            return "aprobado"
        if estado_mp in dom.PENDIENTES:
            return "pendiente"
        if estado_mp in dom.DEVUELTOS:
            return "devuelto"
        return "rechazado"

    def _acreditar(self, reserva: Reserva, pago_web: PagoWeb, externo: PagoExterno) -> Pago:
        """
        Genera el `Pago` y su asiento en la cuenta corriente.

        **Un solo asiento** (migración 043): el Pago es el hecho económico y
        el crédito sale de él. No se emite recibo automático — el recibo es
        papel y lo decide una persona.
        """
        usuario = self._usuario_sistema()
        pago = Pago(
            cliente_id=reserva.cliente_id,
            alquiler_id=None,   # todavía no hay alquiler: es la seña de una reserva
            monto=Decimal(str(pago_web.monto)),
            medio_pago="mercado_pago",
            con_factura=False,
            cobrado_por=usuario.id,
            fecha=date.today(),
            notas=f"Cobro online — Mercado Pago #{externo.payment_id}",
        )
        self.db.add(pago)
        self.db.flush()

        CuentaCorrienteService(self.db).registrar_movimiento(
            cliente_id=reserva.cliente_id,
            tipo="credito",
            concepto=f"Pago online reserva #{reserva.id} ({pago_web.porcentaje_anticipo}%)",
            monto=Decimal(str(pago_web.monto)),
            fecha=date.today(),
            creado_por=usuario.id,
            reserva_id=reserva.id,
            pago_id=pago.id,
        )
        return pago

    def _cerrar_hold(self, pago_web: PagoWeb, resolucion: dom.Resolucion) -> None:
        if not pago_web.hold_token:
            return
        holds = HoldService(self.db)
        try:
            if resolucion.liberar_hold:
                holds.liberar(pago_web.hold_token)
            elif resolucion.acreditar:
                holds.consumir(pago_web.hold_token, pago_web.reserva_id)
        except (NotFoundError, BusinessRuleError):
            # Un hold vencido no impide acreditar: la plata ya entró y el cupo
            # se re-verificó por su cuenta unas líneas más arriba.
            logger.info("[MercadoPago] hold %s ya no vigente al cerrar", pago_web.hold_token)

    def _a_revision(self, pago_web: PagoWeb, externo: PagoExterno, motivo: str) -> dict:
        """
        Algo no cierra. No se confirma nada y se deja constancia.

        No se devuelve la plata automáticamente: la decisión #5 sigue abierta,
        y una devolución automática ante una discrepancia que puede ser un
        error nuestro sería peor que una llamada telefónica.
        """
        logger.error("[MercadoPago] a revisión (pago_web=%s): %s", pago_web.id, motivo)
        pago_web.estado = "revision"
        pago_web.estado_externo = externo.estado
        pago_web.payment_id = externo.payment_id
        pago_web.payload = externo.crudo
        pago_web.detalle = motivo
        pago_web.procesado_en = datetime.utcnow()

        reserva = self.db.get(Reserva, pago_web.reserva_id)
        if reserva is not None:
            reserva.estado = EstadoReserva.REVISION_SIN_CUPO.value
            NotificacionService(self.db).avisar_reserva_web(reserva)

        self.db.commit()
        return {"resultado": "revision", "motivo": motivo, "reserva_id": pago_web.reserva_id}

    def _cliente_para(
        self,
        nombre: str,
        email: str,
        telefono: str,
        dni: str,
        fecha_nacimiento: date | None,
    ) -> Cliente:
        """
        Busca por DNI/CUIT antes de crear.

        Quien reserva por la web puede ser un cliente de siempre: duplicarlo
        partiría su cuenta corriente y su historial en dos, que es exactamente
        lo que el sistema evita en todos los otros caminos.
        """
        existente = (
            self.db.query(Cliente)
            .filter(Cliente.dni_cuit == dni, Cliente.activo.is_(True))
            .first()
        )
        if existente is not None:
            # Se completa lo que falte, sin pisar lo cargado: el dato del
            # mostrador suele estar más verificado que el de un formulario web.
            if not existente.email:
                existente.email = email
            # La fecha de nacimiento no es cosmética: de ella sale el recargo
            # por edad (D-38). Si el cliente ya existía sin ella, la cotización
            # que vio en la web la usaría y el precio de lista de la reserva
            # no, y esa diferencia se rechaza como un descuento sin motivo.
            if existente.fecha_nacimiento is None and fecha_nacimiento is not None:
                existente.fecha_nacimiento = fecha_nacimiento
            self.db.flush()
            return existente

        cliente = Cliente(
            nombre_completo=nombre,
            dni_cuit=dni,
            telefono=telefono,
            email=email,
            tipo="particular",
            fecha_nacimiento=fecha_nacimiento,
            notas="Alta automática desde una reserva web.",
        )
        self.db.add(cliente)
        self.db.flush()
        return cliente

    def _usuario_sistema(self) -> Usuario:
        """
        Nadie del equipo cargó esta reserva, pero `usuario_id` y `cobrado_por`
        son obligatorios. Se usa el primer usuario, igual que en
        `POST /public/solicitudes`. Con Clerk integrado corresponde crear un
        usuario "Sistema" explícito.
        """
        usuario = self.db.query(Usuario).order_by(Usuario.id).first()
        if usuario is None:
            raise BusinessRuleError(
                "sistema_sin_usuarios",
                "El sistema todavía no está configurado para recibir reservas web",
            )
        return usuario
