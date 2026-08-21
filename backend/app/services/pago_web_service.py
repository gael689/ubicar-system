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
from app.adapters.pagos.interface import (
    IPasarelaPago,
    Pagador,
    PagoExterno,
    ReglasCobro,
)
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.domain import pagos_web as dom
from app.domain.enums import EstadoReserva
from app.models.categoria import Categoria
from app.models.cliente import Cliente
from app.models.hold import Hold
from app.models.pago import Pago
from app.models.pago_web import PagoWeb
from app.models.reserva import Reserva
from app.models.usuario import AUTH_SUB_SISTEMA, Usuario
from app.services.configuracion_service import ConfiguracionService
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.services.caja_service import CajaService
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.disponibilidad_service import DisponibilidadService
from app.services.email_reservas import notificar_reserva_pagada
from app.services.hold_service import HoldService
from app.services.notificacion_service import NotificacionService
from app.services.precio_service import PrecioService
from app.services.reserva_service import ReservaService

logger = logging.getLogger(__name__)


def _motivo_descuento(cotizacion, porcentaje_anticipo: int, descuento_d30: Decimal) -> str | None:
    """
    Por qué esta reserva vale menos que el precio de lista.

    **`ReservaService.create` exige un motivo para cualquier diferencia** y
    hace bien: un precio distinto al de lista sin explicación es un descuento
    que nadie autorizó. Pero acá se dejaba constancia sólo del descuento por
    pagar el 100% (D-30, la palanca de `configuracion`) y **no del descuento
    por duración** (D-43/D-49), que en la web también se gana pagando todo por
    adelantado y que viene adentro de `cotizacion.total`.

    El resultado era que **toda reserva web al 100% con más de 3 días moría en
    un 409** —`descuento_sin_motivo`, antes de llegar a Mercado Pago— o sea
    justo la opción que la web empuja porque es la que más conviene a las dos
    partes. Con seña parcial no pasaba: ahí no hay ningún descuento, el precio
    es el de lista y no hay nada que explicar.

    Los dos descuentos se apilan, así que el motivo los nombra a los dos.
    """
    motivos: list[str] = []
    duracion = Decimal(str(getattr(cotizacion, "descuento_monto", 0) or 0))
    if duracion > 0:
        nombre = getattr(cotizacion, "descuento_nombre", None) or "Descuento por duración"
        porcentaje = getattr(cotizacion, "descuento_porcentaje", 0)
        motivos.append(
            f"{nombre} ({porcentaje}%) por abonar el total por adelantado (D-49)"
        )
    if descuento_d30 > 0:
        motivos.append(f"Descuento por pago total del {porcentaje_anticipo}% (D-30)")
    return " + ".join(motivos) or None


class PagoWebService:
    def __init__(self, db: Session, pasarela: IPasarelaPago | None = None) -> None:
        self.db = db
        # Inyectable: los tests pasan la pasarela falsa y ejercitan el webhook
        # completo sin red.
        self._pasarela = pasarela

    @property
    def pasarela(self) -> IPasarelaPago:
        """
        La pasarela, resuelta **recién cuando se la usa**.

        Se resolvía en el constructor, y eso rompía el camino que no la
        necesita: `reservar_para_transferencia` no habla con ninguna pasarela
        —crea la reserva y devuelve el CBU— pero instanciar el service ya
        levantaba `PasarelaNoConfigurada` en producción por no tener
        credenciales de Mercado Pago.

        O sea que **la transferencia, que existe justamente porque todavía no
        hay Mercado Pago, no se podía usar hasta tener Mercado Pago.** Y el
        síntoma en el navegador era un error de CORS: un 500 sin manejar sale
        por fuera del middleware que agrega los headers, así que el browser
        reporta el header faltante en vez del error real.
        """
        if self._pasarela is None:
            self._pasarela = get_pasarela()
        return self._pasarela

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
        condicion_iva: str | None = None,
        razon_social: str | None = None,
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
        self._validar_edad_minima(fecha_nacimiento, hold.fecha_inicio)

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
            # Y que la preferencia siga siendo pagable: si el cliente apretó
            # "Darme más tiempo", el hold se extendió pero la preferencia no.
            and dom.preferencia_sigue_viva(en_curso.vence_en)
        ):
            return self._respuesta_checkout(en_curso)

        cotizacion, categoria_id = PrecioService(self.db).calcular(
            fecha_inicio=hold.fecha_inicio,
            fecha_fin=hold.fecha_fin,
            categoria_id=hold.categoria_id,
            canal="web",
            adicionales=adicionales or [],
            fecha_nacimiento=fecha_nacimiento,
            # **Imprescindible.** El descuento por duración depende de cuánto
            # adelanta (`aplica_descuento_por_duracion`). Sin esto, el total que
            # se cobra sale sin descuento aunque el cliente haya elegido pagar
            # el 100% y visto el precio rebajado — se le cobraría de más
            # exactamente a quien más adelanta.
            porcentaje_anticipo=porcentaje_anticipo,
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
        motivo_d30 = _motivo_descuento(cotizacion, porcentaje_anticipo, descuento_d30)

        cliente = self._cliente_para(
            nombre, email, telefono, dni, fecha_nacimiento,
            condicion_iva=condicion_iva, razon_social=razon_social,
        )
        usuario_sistema = self._usuario_sistema()

        # Si el hold ya tenía un checkout abierto y el cliente cambió cuánto
        # quiere adelantar, se reusa **su reserva**: sólo cambia el importe.
        # Crear una segunda dejaría una huérfana en `pendiente_pago`.
        if en_curso is not None:
            en_curso.estado = "rechazado"
            en_curso.detalle = (
                "Reemplazado: el cliente cambió el porcentaje de anticipo"
                if en_curso.porcentaje_anticipo != porcentaje_anticipo
                else "Reemplazado: la preferencia anterior había vencido"
            )
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
        nombre_pila, apellido = dom.partir_nombre(nombre)
        vence_en = dom.vencimiento_preferencia(hold.expira_en)
        preferencia = self.pasarela.crear_preferencia(
            titulo=f"Reserva {categoria.nombre} — Ubicar Rent",
            monto=anticipo.monto_a_cobrar,
            referencia_externa=dom.referencia_externa(reserva.id),
            pagador=Pagador(
                email=email,
                nombre=nombre_pila,
                apellido=apellido,
                telefono=telefono,
                dni=dni,
            ),
            url_exito=f"{pasarela_web}/reservar/listo?status=approved",
            url_pendiente=f"{pasarela_web}/reservar/listo?status=pending",
            url_error=f"{pasarela_web}/reservar/listo?status=failure",
            url_webhook=url_webhook or "",
            reglas=ReglasCobro(
                cuotas_maximas=self._cuotas_maximas(),
                # El efectivo se excluye siempre: se acredita a los tres días
                # y el hold dura veinte minutos. Ver `_payment_methods` en el
                # adaptador.
                excluir_efectivo=True,
                vence_en=vence_en,
                descriptor=dom.DESCRIPTOR_TARJETA,
            ),
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
            vence_en=vence_en,
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

        # La plata volvió al cliente: el libro tiene que dejar de decir que
        # entró, y alguien se tiene que enterar hoy. Ver `_revertir_cobro`.
        if externo.estado in dom.DEVUELTOS:
            self._revertir_cobro(reserva, pago_web, externo)

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

    def _validar_edad_minima(self, fecha_nacimiento: date | None, fecha_inicio: date) -> None:
        """
        D-51 (plan de conexión, 13/08) — revierte D-38. Sin `fecha_nacimiento`
        no hay nada que validar acá: el paso 3 de la web la pide, pero este
        service también lo usan caminos que todavía no la tienen (se corrige
        río abajo si hiciera falta).
        """
        if fecha_nacimiento is None:
            return
        from app.domain.edades import calcular_edad
        from app.services.configuracion_service import ConfiguracionService

        edad = calcular_edad(fecha_nacimiento, fecha_inicio)
        minima = ConfiguracionService(self.db).get_int("alquiler.edad_minima", 21)
        if edad < minima:
            raise BusinessRuleError(
                "edad_minima",
                f"Para alquilar online hay que ser mayor de {minima} años. "
                "Escribinos por WhatsApp y lo vemos con un agente comercial.",
            )

    def _descuento_pago_total(self) -> Decimal:
        return ConfiguracionService(self.db).get_decimal(
            dom.CLAVE_DESCUENTO_PAGO_TOTAL, dom.DESCUENTO_PAGO_TOTAL_DEFAULT
        )

    def _cuotas_maximas(self) -> int:
        return ConfiguracionService(self.db).get_int(
            dom.CLAVE_CUOTAS_MAXIMAS, dom.CUOTAS_MAXIMAS_DEFAULT
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
            reserva_id=reserva.id,
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
            # Plata que entró por un auto que todavía no se entregó: anticipo.
            # El check-out lo marca aplicado contra el débito del alquiler.
            naturaleza="anticipo",
            concepto=f"Pago online reserva #{reserva.id} ({pago_web.porcentaje_anticipo}%)",
            monto=Decimal(str(pago_web.monto)),
            fecha=date.today(),
            creado_por=usuario.id,
            reserva_id=reserva.id,
            pago_id=pago.id,
        )
        return pago

    def _revertir_cobro(self, reserva: Reserva, pago_web: PagoWeb, externo: PagoExterno) -> None:
        """
        Una devolución o un contracargo de Mercado Pago, copiados al libro.

        **Sin intervención humana, y no es un atajo.** El hecho económico ya
        ocurrió afuera: la plata volvió al cliente porque él pidió la devolución
        o porque el banco resolvió el contracargo. Nadie de acá lo eligió y no
        hay nada que aprobar. Lo único que había era un libro afirmando que esa
        plata entró y una caja que la contaba — durante días, hasta que alguien
        mirara el panel de Mercado Pago.

        Hace las tres cosas juntas:

        1. **Contra-asiento del crédito** que había generado `_acreditar`.
        2. **Egreso de caja** de tipo `reembolso` con medio `mercado_pago`: no
           salió del cajón, y la caja del día tiene que poder distinguirlo.
        3. **Aviso crítico al equipo**, porque lo que sigue —el auto, la
           respuesta al cliente— sí necesita una persona.

        Es idempotente: si el webhook llega dos veces, el crédito ya está
        anulado y no se hace nada.
        """
        if pago_web.pago_id is None:
            # Nunca se acreditó: no hay nada que revertir. Puede pasar con un
            # contracargo sobre un pago que quedó en revisión.
            return

        movimiento = (
            self.db.query(MovimientoCuentaCorriente)
            .filter(
                MovimientoCuentaCorriente.pago_id == pago_web.pago_id,
                MovimientoCuentaCorriente.anulado.is_(False),
            )
            .first()
        )
        if movimiento is None:
            # Ya revertido (o nunca asentado). Idempotencia: un webhook
            # repetido no puede descontar la plata dos veces.
            return

        usuario = self._usuario_sistema()
        etiqueta = "contracargo" if externo.estado == "charged_back" else "devolución"
        motivo = (
            f"{etiqueta.capitalize()} de Mercado Pago — pago #{externo.payment_id} "
            f"de la reserva #{reserva.id}"
        )

        CuentaCorrienteService(self.db).anular_movimiento(
            movimiento.id, motivo=motivo, creado_por=usuario.id,
        )
        CajaService(self.db).registrar(
            tipo="reembolso",
            monto=Decimal(str(pago_web.monto)),
            medio="mercado_pago",
            motivo=motivo,
            fecha=date.today(),
            creado_por=usuario.id,
            cliente_id=reserva.cliente_id,
            reserva_id=reserva.id,
        )

        NotificacionService(self.db).generar_una({
            "tipo": "pago_web_devuelto",
            "titulo": (
                "Contracargo de Mercado Pago" if externo.estado == "charged_back"
                else "Devolución de Mercado Pago"
            ),
            "descripcion": (
                f"Reserva #{reserva.id} — ${pago_web.monto} volvieron al cliente. "
                f"El asiento ya se revirtió solo; hay que decidir qué pasa con la reserva."
            ),
            "urgencia": "critica",
            "entidad_tipo": "reserva",
            "entidad_id": reserva.id,
            "url_destino": "/reservas-web",
            "fecha_objetivo": None,
        })

        logger.warning(
            "[MercadoPago] %s revertido: reserva=%s payment=%s monto=%s",
            etiqueta, reserva.id, externo.payment_id, pago_web.monto,
        )

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

    def reservar_para_transferencia(
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
        condicion_iva: str | None = None,
        razon_social: str | None = None,
    ) -> dict:
        """
        Reserva a pagar por transferencia bancaria.

        **La diferencia de fondo con Mercado Pago es que acá no hay webhook.**
        Nadie le avisa al sistema que la plata llegó: el cliente transfiere,
        manda el comprobante por WhatsApp y **alguien del equipo lo concilia
        contra el extracto** antes de confirmar. Por eso la reserva queda en
        `pendiente_pago` y **no se confirma sola** — el que la confirma es una
        persona, desde el sistema.

        Que `pendiente_pago` no ocupe calendario es justamente lo que hace
        seguro este camino: si la transferencia nunca llega, el auto no queda
        bloqueado. Lo sostiene el hold, que vence solo.

        No se crea ningún `PagoWeb`: esa tabla es el registro de una
        preferencia de pasarela, y acá no hay pasarela. El pago se carga como
        cobro cuando se acredita, por el mismo camino que cualquier otro.
        """
        dom.validar_porcentaje(porcentaje_anticipo)

        self.db.execute(select(Hold.id).where(Hold.token == hold_token).with_for_update())
        hold = HoldService(self.db).vigente_o_error(hold_token)
        categoria = self.db.get(Categoria, hold.categoria_id)
        if categoria is None or not categoria.activo:
            raise NotFoundError("Categoría", hold.categoria_id)
        self._validar_edad_minima(fecha_nacimiento, hold.fecha_inicio)

        cotizacion, categoria_id = PrecioService(self.db).calcular(
            fecha_inicio=hold.fecha_inicio,
            fecha_fin=hold.fecha_fin,
            categoria_id=hold.categoria_id,
            canal="web",
            adicionales=adicionales or [],
            fecha_nacimiento=fecha_nacimiento,
            porcentaje_anticipo=porcentaje_anticipo,
        )
        total = Decimal(str(cotizacion.total))
        anticipo = dom.calcular_anticipo(
            total, porcentaje_anticipo, self._descuento_pago_total()
        )

        precio_vehiculo = total - Decimal(str(cotizacion.total_adicionales))
        descuento_d30 = total - Decimal(str(anticipo.total_final))
        motivo_d30 = _motivo_descuento(cotizacion, porcentaje_anticipo, descuento_d30)

        cliente = self._cliente_para(
            nombre, email, telefono, dni, fecha_nacimiento,
            condicion_iva=condicion_iva, razon_social=razon_social,
        )
        usuario_sistema = self._usuario_sistema()

        reserva, _ = ReservaService(self.db).create(
            cliente_id=cliente.id,
            categoria_id=categoria_id,
            fecha_inicio=hold.fecha_inicio,
            hora_inicio=hold.hora_inicio,
            fecha_fin=hold.fecha_fin,
            hora_fin=hold.hora_fin,
            lugar_entrega=lugar_entrega,
            lugar_devolucion=lugar_devolucion or lugar_entrega,
            notas=notas,
            precio_total=precio_vehiculo - descuento_d30,
            descuento_motivo=motivo_d30,
            forma_pago_prevista="transferencia",
            adicionales=adicionales or [],
            usuario_id=usuario_sistema.id,
            canal="web",
        )
        reserva.estado = EstadoReserva.PENDIENTE_PAGO.value
        reserva.origen = "web"
        # Sin esto, `avisar_reserva_web` no tiene de dónde sacar el contacto:
        # `iniciar_checkout` (el camino de Mercado Pago) sí los carga, y este
        # camino se los había olvidado — el aviso interno mostraba "?" en vez
        # del nombre y el teléfono de quien acababa de dejar la reserva.
        reserva.web_contacto_nombre = nombre
        reserva.web_contacto_email = email
        reserva.web_contacto_telefono = telefono
        self.db.flush()

        # Plan de conexión (13/08), cierra C-4: por transferencia no hay
        # webhook, así que **este** es el único momento en que algo puede
        # avisar que la reserva existe. Antes de esto, el camino de
        # transferencia —el único que hoy puede cobrar de verdad, sin
        # credenciales de Mercado Pago— entraba en silencio total: cero
        # campana, cero mail. Nunca puede tumbar la reserva ya creada.
        try:
            from app.services.notificacion_service import NotificacionService
            NotificacionService(self.db).avisar_reserva_web(reserva)
        except Exception:
            logger.exception("[Transferencia] falló el aviso instantáneo de la reserva #%s", reserva.id)
        try:
            from app.services.email_reservas import notificar_reserva_transferencia_pendiente
            notificar_reserva_transferencia_pendiente(self.db, reserva, anticipo)
        except Exception:
            logger.exception("[Transferencia] falló el mail de la reserva #%s", reserva.id)

        return {
            "reserva_id": reserva.id,
            "numero": getattr(reserva, "numero_formateado", None) or str(reserva.id),
            # `monto_a_cobrar`, no `monto`: el dataclass `Anticipo` no tiene un
            # campo `monto` y esto levantaba AttributeError **después** de
            # crear la reserva, así que el endpoint devolvía 500, la sesión se
            # revertía y el camino de transferencia no funcionaba nunca.
            "monto_a_transferir": float(anticipo.monto_a_cobrar),
            "total": float(anticipo.total_final),
            # Lo que queda para el mostrador. Sin esto la pantalla de "ya
            # transferí" no puede decir cuánto falta al retirar el auto.
            "saldo": float(anticipo.saldo),
            "porcentaje_anticipo": porcentaje_anticipo,
        }

    def _cliente_para(
        self,
        nombre: str,
        email: str,
        telefono: str,
        dni: str,
        fecha_nacimiento: date | None,
        condicion_iva: str | None = None,
        razon_social: str | None = None,
    ) -> Cliente:
        """
        Busca por DNI/CUIT antes de crear.

        Quien reserva por la web puede ser un cliente de siempre: duplicarlo
        partiría su cuenta corriente y su historial en dos, que es exactamente
        lo que el sistema evita en todos los otros caminos.

        Los datos fiscales llegan del paso 3. **No habilitan a facturar** —el
        sistema no emite comprobantes fiscales— pero dejan cargado el CUIT y la
        razón social de quien va a pedir factura, que hoy hay que pedírselos
        por WhatsApp después. Una razón social implica `tipo='empresa'`: es el
        mismo criterio que usa el alta desde el mostrador.
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
            # Mismo criterio para lo fiscal: se completa el hueco, no se pisa.
            # Si en el mostrador lo cargaron como responsable inscripto, un
            # formulario web donde alguien dejó el default no puede degradarlo
            # a consumidor final y cambiarle el comprobante que le corresponde.
            if existente.condicion_iva is None and condicion_iva:
                existente.condicion_iva = condicion_iva
            if not existente.razon_social and razon_social:
                existente.razon_social = razon_social
            self.db.flush()
            return existente

        cliente = Cliente(
            nombre_completo=nombre,
            dni_cuit=dni,
            telefono=telefono,
            email=email,
            tipo="empresa" if razon_social else "particular",
            fecha_nacimiento=fecha_nacimiento,
            condicion_iva=condicion_iva,
            razon_social=razon_social,
            notas="Alta automática desde una reserva web.",
            # Migración 077. `creado_por` queda nulo: el alta la ejecuta el
            # usuario "Sistema", y ese nombre en la ficha no informa nada.
            origen="web",
        )
        self.db.add(cliente)
        self.db.flush()
        return cliente

    def _usuario_sistema(self) -> Usuario:
        """
        Nadie del equipo cargó esta reserva, pero `usuario_id` y `cobrado_por`
        son obligatorios. Se busca primero el usuario "Sistema" explícito
        (D-53, `AUTH_SUB_SISTEMA`) y, si el script de limpieza todavía no lo
        creó, se cae al primero por id — igual que en `POST /public/solicitudes`
        — para no romper instalaciones viejas.
        """
        usuario = (
            self.db.query(Usuario).filter(Usuario.auth_sub == AUTH_SUB_SISTEMA).first()
            or self.db.query(Usuario).order_by(Usuario.id).first()
        )
        if usuario is None:
            raise BusinessRuleError(
                "sistema_sin_usuarios",
                "El sistema todavía no está configurado para recibir reservas web",
            )
        return usuario
