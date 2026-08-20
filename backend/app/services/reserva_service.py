from __future__ import annotations
"""
ReservaService — orquesta la lógica de negocio de reservas.
Capa transaccional: cruza vehículo, cliente, reserva dentro de transacciones explícitas.
"""
from datetime import datetime, date, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ConflictError, BusinessRuleError
from app.domain.enums import EstadoReserva, EstadoVehiculo
from app.domain.solapamientos import detectar_solapamientos
from app.domain.precios import AdicionalSolicitado, validar_seleccion_adicionales
from app.domain.tarifas import (
    cotizar_por_bandas, calcular_duracion_dias, canal_de_origen, TarifaInfo,
)
from app.models.adicional import Adicional, ReservaAdicional
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.categoria import Categoria


# Etiquetas legibles del motivo, para que el mensaje de conflicto diga
# "está en mantenimiento" y no "bloqueo|mantenimiento".
MOTIVO_BLOQUEO_LABEL = {
    "mantenimiento": "En mantenimiento",
    "siniestro": "Siniestrado",
    "uso_interno": "Uso interno",
    "venta": "En venta",
    "otro": "Bloqueado",
}
from app.domain.transiciones import (
    estado_tras_confirmar_reserva,
    estado_tras_cancelar_reserva_confirmada,
)
from app.domain.ventana import VentanaReserva
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.models.cliente import Cliente, ConductorAdicional
from app.models.tarifa import Tarifa
from app.repositories.reserva_repo import ReservaRepo
from app.repositories.alquiler_repo import AlquilerRepo
from app.services import auditoria_service
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.echeq_service import EcheqService
from app.services.precio_service import PrecioService


class ReservaService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.reserva_repo = ReservaRepo(db)
        self.alquiler_repo = AlquilerRepo(db)
        self.cc_service = CuentaCorrienteService(db)
        self.echeq_service = EcheqService(db)

    # ── Lectura ───────────────────────────────────────────────────────────────

    def get(self, id: int) -> Reserva:
        reserva = self.reserva_repo.get(id)
        if not reserva:
            raise NotFoundError("Reserva", id)
        return reserva

    def list(
        self,
        estado: str | None = None,
        vehiculo_id: int | None = None,
        cliente_id: int | None = None,
        q: str | None = None,
        fecha=None,
        origen: str | None = None,
        categoria_id: int | None = None,
        contrato: str | None = None,
        fecha_desde=None,
        fecha_hasta=None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Reserva], int]:
        self.sincronizar_estados_por_horario()
        return self.reserva_repo.list(
            estado=estado,
            vehiculo_id=vehiculo_id,
            cliente_id=cliente_id,
            q=q,
            fecha=fecha,
            origen=origen,
            categoria_id=categoria_id,
            contrato=contrato,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            page=page,
            page_size=page_size,
        )

    def sincronizar_estados_por_horario(self):
        """
        Actualiza el estado de las reservas basándose en el tiempo actual.

        Importante: esta sincronización NUNCA finaliza un alquiler. Sólo un
        check-in real (AlquilerService.checkin) puede pasar una reserva a
        'finalizada'. Antes, pasada la hora de fin la reserva saltaba directo
        a 'finalizada' sin que el auto hubiera vuelto, y como checkin() exige
        estado 'activa', quedaba IMPOSIBLE registrar una devolución tardía.
        Ahora pasa a 'vencida' — el auto sigue afuera, pero el check-in ya
        puede hacerse sobre ese estado (ver AlquilerService.checkin).
        """
        now = datetime.now()
        current_date = now.date()
        current_time = now.time()

        with self.db.begin_nested():
            # Confirmada -> Activa (ya pasó la fecha_inicio + hora_inicio)
            self.db.query(Reserva).filter(
                Reserva.estado == EstadoReserva.CONFIRMADA.value,
                (Reserva.fecha_inicio < current_date) |
                ((Reserva.fecha_inicio == current_date) & (Reserva.hora_inicio <= current_time))
            ).update({"estado": EstadoReserva.ACTIVA.value}, synchronize_session=False)

            # Activa -> Vencida (ya pasó la fecha_fin + hora_fin y no hubo checkin)
            self.db.query(Reserva).filter(
                Reserva.estado == EstadoReserva.ACTIVA.value,
                (Reserva.fecha_fin < current_date) |
                ((Reserva.fecha_fin == current_date) & (Reserva.hora_fin <= current_time))
            ).update({"estado": EstadoReserva.VENCIDA.value}, synchronize_session=False)
        self.db.commit()

    # ── Crear reserva ─────────────────────────────────────────────────────────

    def sincronizar_adicionales(
        self,
        reserva: Reserva,
        solicitados: list[tuple[int, int]] | None,
    ) -> None:
        """
        Deja los adicionales de la reserva igual a `solicitados` — una lista
        de `(adicional_id, cantidad)`. `None` significa "no tocar nada"
        (un PATCH que no menciona adicionales no debe borrarlos); una lista
        vacía sí los saca a todos.

        **El precio se congela acá**, tomando el vigente del catálogo. Las
        líneas que ya existían y siguen pedidas con la misma cantidad **no se
        recrean**: conservan el precio con el que se pactaron, que es todo el
        sentido de congelarlo. Si mañana sube la cobertura full, editar la
        reserva para agregar un GPS no debe reencarecer el seguro.

        **No se puede tocar después del check-out**: en ese momento el
        alquiler ya se facturó como un débito en la cuenta corriente, y
        cambiar los adicionales dejaría el ledger diciendo una cosa y la
        reserva otra.
        """
        if solicitados is None:
            return

        if reserva.alquiler is not None:
            raise BusinessRuleError(
                "reserva_ya_facturada",
                "No se pueden cambiar los adicionales después del check-out: "
                "el alquiler ya se facturó en la cuenta corriente",
            )

        duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)
        pedidos = {aid: cant for aid, cant in solicitados}

        if pedidos:
            catalogo = {
                a.id: a
                for a in self.db.query(Adicional)
                .filter(Adicional.id.in_(list(pedidos)), Adicional.activo.is_(True))
                .all()
            }
            faltantes = set(pedidos) - set(catalogo)
            if faltantes:
                raise NotFoundError("Adicional", sorted(faltantes)[0])

            # Las coberturas son excluyentes — se valida en el dominio para
            # que valga igual desde el mostrador y desde la web.
            validar_seleccion_adicionales([
                AdicionalSolicitado(
                    id=a.id, nombre=a.nombre,
                    precio_unitario=self._precio_unitario_adicional(a, reserva),
                    unidad_cobro=a.unidad_cobro, cantidad=pedidos[a.id], grupo=a.grupo,
                )
                for a in catalogo.values()
            ])
            for aid, cantidad in pedidos.items():
                a = catalogo[aid]
                if a.max_cantidad is not None and cantidad > a.max_cantidad:
                    raise BusinessRuleError(
                        "cantidad_excede_maximo",
                        f"'{a.nombre}' admite hasta {a.max_cantidad} unidad(es) por reserva",
                    )
        else:
            catalogo = {}

        existentes = {ra.adicional_id: ra for ra in reserva.adicionales}

        # Sacar lo que ya no está pedido. Es una línea de la reserva, no una
        # entidad de dominio: si el cliente se arrepiente del GPS antes de
        # retirar, la línea desaparece (misma lógica que las fotos de daños).
        for adicional_id, ra in existentes.items():
            if adicional_id not in pedidos:
                reserva.adicionales.remove(ra)

        for adicional_id, cantidad in pedidos.items():
            actual = existentes.get(adicional_id)
            if actual is not None and actual.cantidad == cantidad:
                continue  # sin cambios: conserva su precio congelado
            if actual is not None:
                reserva.adicionales.remove(actual)
            a = catalogo[adicional_id]
            unitario = self._precio_unitario_adicional(a, reserva)
            reserva.adicionales.append(
                ReservaAdicional(
                    adicional_id=a.id,
                    cantidad=cantidad,
                    precio_unitario=unitario,
                    unidad_cobro=a.unidad_cobro,
                    subtotal=self._subtotal_adicional(
                        unitario, a.unidad_cobro, cantidad, duracion,
                        es_porcentaje=getattr(a, "porcentaje_sobre_alquiler", None) is not None,
                    ),
                )
            )

    @staticmethod
    def _precio_unitario_adicional(a: Adicional, reserva) -> Decimal:
        """Lo que cuesta una unidad de este adicional **en esta reserva**.

        Las coberturas no tienen precio propio: cuestan un porcentaje del
        alquiler (`porcentaje_sobre_alquiler`), y su `precio` es 0. Hasta acá
        se congelaba ese 0, así que:

          1. el cliente veía "+30%" en la web y lo pagaba en la pasarela
             —`PagoWebService` sí recalcula bien contra `PrecioService`—, pero
          2. la línea de la reserva quedaba en $0,
          3. `total_adicionales` daba 0 y el saldo contaba de menos,
          4. y el sistema mostraba que el cliente había pagado de más.

        O sea: plata cobrada que no existía como concepto en ningún lado.

        La base es `reserva.precio_total`, que **es sólo el vehículo** — los
        adicionales van aparte por invariante del modelo (ver
        `Reserva.total_adicionales`). Es la misma base sobre la que cotiza
        `PrecioService`, así que los dos números coinciden.
        """
        pct = getattr(a, "porcentaje_sobre_alquiler", None)
        if pct is None:
            return Decimal(str(a.precio))
        base = Decimal(str(reserva.precio_total or 0))
        return (base * Decimal(str(pct)) / Decimal(100)).quantize(Decimal("0.01"))

    @staticmethod
    def _subtotal_adicional(
        precio_unitario: Decimal, unidad_cobro: str, cantidad: int, duracion_dias: int,
        es_porcentaje: bool = False,
    ) -> Decimal:
        """
        `es_porcentaje` **no multiplica por los días aunque la unidad de cobro
        diga `por_dia`**, porque el porcentaje ya se calculó sobre el alquiler
        entero: multiplicarlo otra vez cobraría un 30% por cada día, o sea
        120% en un alquiler de cuatro.

        Es exactamente la misma excepción que hace el cotizador
        (`domain/precios.py`: `if a.unidad_cobro == "por_dia" and not
        a.es_porcentaje`). Tienen que coincidir: uno es lo que se le muestra
        y se le cobra al cliente, el otro es lo que queda registrado.
        """
        multiplicador = Decimal(cantidad)
        if unidad_cobro == "por_dia" and not es_porcentaje:
            multiplicador *= Decimal(duracion_dias)
        return precio_unitario * multiplicador

    def recalcular_adicionales_por_duracion(self, reserva: Reserva) -> None:
        """
        Reajusta los adicionales `por_dia` cuando cambia la duración.

        Si el alquiler se extiende de 5 a 8 días, el seguro cubre esos 3 días
        más y hay que cobrarlos. **El precio unitario congelado no se toca**:
        lo que cambia es la cantidad de días, no lo que se pactó por día.
        """
        duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)
        for ra in reserva.adicionales:
            if ra.unidad_cobro == "por_dia":
                ra.subtotal = self._subtotal_adicional(
                    Decimal(str(ra.precio_unitario)), ra.unidad_cobro, ra.cantidad, duracion
                )

    def _nacimiento_del_conductor(
        self, cliente_id: int, conductor_id: int | None
    ) -> date | None:
        """
        La fecha de nacimiento de quien va a manejar.

        **La edad que cuenta es la del conductor efectivo**: si la reserva
        designa un conductor adicional, es él quien maneja, así que la edad
        relevante es la suya y no la del titular que paga.

        Ya no cambia el precio —se retiró el recargo por franja etaria
        (D-38)—, pero sigue haciendo falta para la edad mínima (D-51).
        """
        if conductor_id is not None:
            conductor = self.db.get(ConductorAdicional, conductor_id)
            nacimiento = getattr(conductor, "fecha_nacimiento", None) if conductor else None
            if nacimiento is not None:
                return nacimiento
        cliente = self.db.get(Cliente, cliente_id)
        return cliente.fecha_nacimiento if cliente else None

    def _validar_conductor(self, conductor_id: int, cliente_id: int) -> None:
        """El conductor tiene que ser un conductor adicional activo del propio cliente."""
        conductor = (
            self.db.query(ConductorAdicional)
            .filter(ConductorAdicional.id == conductor_id)
            .first()
        )
        if not conductor or not conductor.activo:
            raise NotFoundError("Conductor adicional", conductor_id)
        if conductor.cliente_id != cliente_id:
            raise BusinessRuleError(
                "conductor_no_pertenece_al_cliente",
                "El conductor seleccionado no pertenece al cliente de la reserva",
            )

    def create(
        self,
        cliente_id: int,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
        lugar_entrega: str,
        lugar_devolucion: str,
        # Uno de los dos es obligatorio (ítem 58): auto puntual desde el
        # mostrador, categoría desde la web.
        vehiculo_id: int | None = None,
        categoria_id: int | None = None,
        notas: str | None = None,
        hora_devolucion_acordada: time | None = None,
        late_checkout: bool = False,
        cargo_late_checkout: Decimal = Decimal("0"),
        precio_total: Decimal | None = None,
        # Garantía
        garantia_tipo: str | None = None,
        garantia_monto: Decimal | None = None,
        garantia_tarjeta_numero: str | None = None,
        garantia_tarjeta_vencimiento: str | None = None,
        garantia_tarjeta_titular: str | None = None,
        # Pago
        forma_pago_prevista: str | None = None,
        estado_pago: str = "pendiente",
        anticipo_monto: Decimal | None = None,
        anticipo_fecha: date | None = None,
        anticipo_medio_pago: str | None = None,
        conductor_id: int | None = None,
        con_factura: bool = False,
        descuento_motivo: str | None = None,
        condicion_pago: str = "contado",
        condicion_pago_ancla: str | None = None,
        condicion_pago_fecha_ancla: date | None = None,
        tipo_factura: str | None = None,
        factura_a_nombre_de: str | None = None,
        echeq_banco: str | None = None,
        echeq_numero_cheque: str | None = None,
        echeq_fecha_cobro: date | None = None,
        adicionales: list[tuple[int, int]] | None = None,
        usuario_id: int = 0,
        # Canal con el que se resuelve el precio de lista. La web tiene su
        # propia lista de precios (ver `/precios/web`), así que cotizarla
        # contra la del mostrador daría una diferencia que nadie hizo a mano.
        canal: str = "mostrador",
    ) -> tuple[Reserva, list[dict]]:
        """
        Crea una reserva en estado 'pendiente'.

        Returns:
            (reserva, warnings) — warnings son solapamientos con pendientes.

        Raises:
            NotFoundError: vehículo o cliente no existe o está inactivo.
            ConflictError: solapamiento contra reserva confirmada o alquiler activo.
        """
        # 1. Verificar que vehículo/categoría y cliente existen y están activos.
        #
        # Desde la Fase 5 (ítem 58) una reserva puede ser **por categoría**,
        # sin auto asignado todavía — así reserva la web. La invariante es que
        # al menos uno de los dos esté: sin ninguno, la reserva no dice qué se
        # está alquilando.
        if vehiculo_id is None and categoria_id is None:
            raise BusinessRuleError(
                "reserva_sin_vehiculo_ni_categoria",
                "La reserva necesita un vehículo o al menos una categoría",
            )

        vehiculo = None
        if vehiculo_id is not None:
            vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id).first()
            if not vehiculo or not vehiculo.activo:
                raise NotFoundError("Vehículo", vehiculo_id)
            # El auto manda: su categoría real gana sobre la que hayan pedido.
            categoria_id = vehiculo.categoria_id or categoria_id
        else:
            categoria = self.db.query(Categoria).filter(Categoria.id == categoria_id).first()
            if not categoria or not categoria.activo:
                raise NotFoundError("Categoría", categoria_id)

        cliente = self.db.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente or not cliente.activo:
            raise NotFoundError("Cliente", cliente_id)

        if conductor_id is not None:
            self._validar_conductor(conductor_id, cliente_id)

        # 2. Construir datetime completos para solapamiento
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)

        if inicio_dt >= fin_dt:
            raise BusinessRuleError("fechas_invalidas", "La fecha de fin debe ser posterior a la de inicio")

        # 3. Detectar solapamientos — sólo si hay un auto puntual.
        #
        # Una reserva por categoría no puede solapar con "un vehículo": todavía
        # no tiene ninguno. Lo que la limita es el **cupo** de la categoría, que
        # es una pregunta distinta y la contesta `domain/disponibilidad.py`.
        # Forzarla por este camino habría hecho que reservar una categoría
        # bloqueara un auto arbitrario.
        resultado = None
        if vehiculo_id is not None:
            ventanas = self._cargar_ventanas(vehiculo_id)
            resultado = detectar_solapamientos(vehiculo_id, inicio_dt, fin_dt, ventanas)

            if resultado.hay_conflicto_bloqueante:
                raise self._error_conflicto(resultado.conflictos_bloqueantes[0])

        # 4. Construir warnings por solapamiento con pendientes
        warnings = [] if resultado is None else [
            {
                "tipo": "solape_con_pendiente",
                "reserva_id": v.id,
                "cliente": v.cliente_nombre,
                "fecha_inicio": str(v.inicio.date()),
                "fecha_fin": str(v.fin.date()),
            }
            for v in resultado.conflictos_advertencia
        ]

        # 5. Hora de devolución acordada: default = hora_inicio (mismo horario del checkout)
        hora_dev = hora_devolucion_acordada or hora_inicio

        # Calcular el precio de lista (el que sale de la tarifa) SIEMPRE que
        # haya una tarifa configurada, exista o no un precio_total manual —
        # es lo único que permite auditar un descuento después (ítem 22).
        tarifa_id = None
        precio_lista: Decimal | None = None
        duracion = calcular_duracion_dias(fecha_inicio, fecha_fin)

        # **El precio de lista sale del mismo motor que el precio cobrado.**
        #
        # Antes salía de `cotizar_por_bandas`, que sólo sabe de tarifas por
        # duración: no ve las reglas del calendario, ni las promociones, ni el
        # recargo por edad. Como quien llama —la web, el cotizador, la pantalla
        # de reservas— cotiza con el motor de calendario, los dos números
        # divergían apenas hubiera una regla cargada, y `create()` rechazaba la
        # reserva con "descuento_sin_motivo" por una diferencia que nadie hizo
        # a mano. Con una promo activa era **toda** venta web.
        #
        # El motor de calendario no reemplaza a las bandas: las usa como capa
        # de menor prioridad, así que sin ninguna regla cargada da exactamente
        # lo mismo que antes.
        nacimiento = self._nacimiento_del_conductor(cliente_id, conductor_id)
        cotizacion_lista = None
        try:
            cotizacion_lista, _ = PrecioService(self.db).calcular(
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                categoria_id=categoria_id,
                vehiculo_id=vehiculo_id,
                canal=canal,
                # Sin adicionales a propósito: `precio_lista` se compara contra
                # `precio_total`, que por invariante del modelo tampoco los
                # incluye (ver Reserva.total_adicionales).
                adicionales=None,
                fecha_nacimiento=nacimiento,
            )
            precio_lista = cotizacion_lista.total
        except (BusinessRuleError, NotFoundError):
            cotizacion_lista = None

        # Tarifa aplicada: sigue siendo la banda, que es lo que la ficha
        # muestra como "tarifa". Es informativo y no interviene en el precio.
        tarifas_info, _ = self._cargar_tarifas_info(vehiculo_id, categoria_id)
        try:
            cot = cotizar_por_bandas(duracion, tarifas_info, categoria_id, canal)
            tarifa_id = cot.tarifa_principal.id
            if precio_lista is None:
                precio_lista = cot.total
        except BusinessRuleError:
            pass

        if precio_total is None:
            precio_total = precio_lista

        # Condición de pago: si no es "contado", el ancla es obligatoria — no
        # hay default implícito (antes se contaba siempre desde el checkout
        # sin que nadie lo hubiera decidido).
        if condicion_pago != "contado":
            if condicion_pago_ancla not in ("checkout", "checkin", "fecha_especifica"):
                raise BusinessRuleError(
                    "ancla_requerida",
                    "Con una condición de pago a plazo hay que indicar a partir de cuándo se cuentan los días "
                    "(check-out, check-in, u otra fecha).",
                )
        elif condicion_pago_ancla is None:
            # Contado también tiene un momento: "en el momento" no dice si es
            # al entregar el auto o al recibirlo, y entre las dos cosas puede
            # haber semanas. La pantalla lo pregunta; para quien llama por API
            # —la web, sin nadie del otro lado— vale la entrega, que es lo que
            # el sistema venía haciendo sin decirlo.
            condicion_pago_ancla = "checkout"

        if condicion_pago_ancla == "fecha_especifica" and not condicion_pago_fecha_ancla:
            raise BusinessRuleError(
                "fecha_ancla_requerida",
                "Falta la fecha a partir de la cual se cuenta el plazo de pago.",
            )

        descuento_autorizado_por = None
        if precio_lista is not None and precio_total is not None and precio_total != precio_lista:
            if not descuento_motivo or not descuento_motivo.strip():
                raise BusinessRuleError(
                    "descuento_sin_motivo",
                    f"El precio cargado (${precio_total}) difiere del precio de lista "
                    f"(${precio_lista}) — hace falta un motivo para la diferencia",
                )
            descuento_autorizado_por = usuario_id

        # 5.bis Recargo por edad del conductor (D-38). No rechaza a nadie:
        # la edad modifica el precio. Se congela en la reserva junto con la
        # edad usada, porque el importe no se puede explicar meses después
        # cuando el conductor ya cumplió años.
        # El recargo sale de la MISMA cotización que el precio de lista, no de
        # un segundo cálculo.

        # 6. Crear reserva (ya CONFIRMADA directamente)
        with self.db.begin_nested():
            reserva = Reserva(
                vehiculo_id=vehiculo_id,
                categoria_id=categoria_id,
                cliente_id=cliente_id,
                conductor_id=conductor_id,
                fecha_inicio=fecha_inicio,
                hora_inicio=hora_inicio,
                fecha_fin=fecha_fin,
                hora_fin=hora_fin,
                lugar_entrega=lugar_entrega,
                lugar_devolucion=lugar_devolucion,
                notas=notas,
                hora_devolucion_acordada=hora_dev,
                late_checkout=late_checkout,
                cargo_late_checkout=cargo_late_checkout,
                precio_total=precio_total,
                precio_lista=precio_lista,
                descuento_motivo=descuento_motivo,
                descuento_autorizado_por=descuento_autorizado_por,
                con_factura=con_factura,
                condicion_pago=condicion_pago,
                condicion_pago_ancla=condicion_pago_ancla,
                condicion_pago_fecha_ancla=condicion_pago_fecha_ancla if condicion_pago_ancla == "fecha_especifica" else None,
                tipo_factura=tipo_factura if con_factura else None,
                factura_a_nombre_de=factura_a_nombre_de if con_factura else None,
                echeq_banco=echeq_banco,
                echeq_numero_cheque=echeq_numero_cheque,
                echeq_fecha_cobro=echeq_fecha_cobro,
                tarifa_aplicada_id=tarifa_id,
                garantia_tipo=garantia_tipo,
                garantia_monto=garantia_monto,
                garantia_tarjeta_numero=garantia_tarjeta_numero,
                garantia_tarjeta_vencimiento=garantia_tarjeta_vencimiento,
                garantia_tarjeta_titular=garantia_tarjeta_titular,
                forma_pago_prevista=forma_pago_prevista,
                estado_pago=estado_pago,
                anticipo_monto=anticipo_monto,
                anticipo_fecha=anticipo_fecha,
                anticipo_medio_pago=anticipo_medio_pago,
                estado=EstadoReserva.CONFIRMADA.value,
                usuario_id=usuario_id,
            )
            self.reserva_repo.create(reserva)

            # Si el medio de pago (previsto, o el del anticipo ya cobrado) es
            # "echeq", se crea el Echeq vinculado a esta reserva — puede
            # quedar "pendiente de completar" (banco/número/fecha en None),
            # no es obligatorio cargarlo todo ahora. Sólo genera el crédito
            # en cuenta corriente si hubo un cobro real ya hecho (anticipo o
            # pagado) — si es sólo la forma de pago prevista a futuro, el
            # echeq queda como borrador sin mover el saldo todavía.
            hubo_cobro_ahora = estado_pago != "pendiente"
            es_echeq = forma_pago_prevista == "echeq" or (hubo_cobro_ahora and anticipo_medio_pago == "echeq")
            if es_echeq:
                monto_echeq = anticipo_monto if (hubo_cobro_ahora and anticipo_monto) else precio_total
                if monto_echeq:
                    self.echeq_service.crear_recibido(
                        cliente_id=cliente_id,
                        contraparte=cliente.nombre_completo,
                        monto=Decimal(str(monto_echeq)),
                        fecha_emision=anticipo_fecha if (hubo_cobro_ahora and anticipo_fecha) else date.today(),
                        creado_por=usuario_id,
                        banco=echeq_banco,
                        numero_cheque=echeq_numero_cheque,
                        fecha_cobro=echeq_fecha_cobro,
                        reserva_id=reserva.id,
                        generar_credito=hubo_cobro_ahora,
                    )

            # Adicionales contratados (coberturas y extras). Van fuera de
            # precio_total: se suman recién al facturar, igual que
            # cargo_late_checkout. Ver Reserva.total_adicionales.
            self.sincronizar_adicionales(reserva, adicionales)

            # Actualizar estado del vehículo a reservado si corresponde.
            # En una reserva por categoría no hay auto que marcar: marcar uno
            # arbitrario lo sacaría de circulación sin motivo, que es
            # exactamente lo que la reserva por categoría viene a evitar.
            if vehiculo is not None:
                nuevo_estado = estado_tras_confirmar_reserva(
                    EstadoVehiculo(vehiculo.estado)
                )
                if nuevo_estado.value != vehiculo.estado:
                    vehiculo.estado = nuevo_estado.value

            # Sólo se audita la reserva que salió a un precio distinto al de
            # lista. Auditar todas las altas llenaría el libro con lo que ya
            # está en la tabla de reservas; el descuento autorizado, en
            # cambio, es una decisión de plata que alguien tomó a mano.
            if descuento_autorizado_por is not None:
                auditoria_service.registrar(
                    self.db,
                    usuario_id=usuario_id,
                    accion="autorizar_descuento",
                    entidad_tipo="reserva",
                    entidad_id=reserva.id,
                    descripcion=(
                        f"Reserva #{reserva.id} cargada a ${precio_total} "
                        f"con precio de lista ${precio_lista}. Motivo: {descuento_motivo}"
                    ),
                    datos_antes={"precio_lista": precio_lista},
                    datos_despues={"precio_total": precio_total, "motivo": descuento_motivo},
                    monto=(Decimal(str(precio_lista)) - Decimal(str(precio_total))),
                )

        self.db.refresh(reserva)
        return reserva, warnings

    # ── Actualizar reserva (solo pendiente) ───────────────────────────────────

    def update(
        self,
        id: int,
        usuario_id: int,
        vehiculo_id: int | None = None,
        conductor_id: int | None = None,
        fecha_inicio: date | None = None,
        hora_inicio: time | None = None,
        fecha_fin: date | None = None,
        hora_fin: time | None = None,
        lugar_entrega: str | None = None,
        lugar_devolucion: str | None = None,
        notas: str | None = None,
        precio_total: Decimal | None = None,
        # Pago
        forma_pago_prevista: str | None = None,
        estado_pago: str | None = None,
        anticipo_monto: Decimal | None = None,
        anticipo_fecha: date | None = None,
        anticipo_medio_pago: str | None = None,
        adicionales: list[tuple[int, int]] | None = None,
    ) -> tuple[Reserva, list[dict]]:
        """Actualiza una reserva en estado pendiente, confirmada, activa o vencida (D8).

        Activa/vencida se permiten porque después del checkout el operador
        sigue necesitando editar (agregar una nota, ajustar el lugar de
        devolución, etc.) — igual que `AlquilerService.extender()` ya permite
        esos dos estados por la misma razón."""
        reserva = self.get(id)

        ESTADOS_EDITABLES = (
            EstadoReserva.PENDIENTE.value,
            EstadoReserva.CONFIRMADA.value,
            EstadoReserva.ACTIVA.value,
            EstadoReserva.VENCIDA.value,
        )
        if reserva.estado not in ESTADOS_EDITABLES:
            raise ConflictError(f"estado_invalido|No se puede modificar una reserva en estado '{reserva.estado}'")

        # **Con el alquiler abierto el auto no se cambia acá.**
        #
        # `Alquiler` no tiene `vehiculo_id`: lee el de la reserva. Cambiarlo
        # con el alquiler en curso reescribe retroactivamente qué auto salió, y
        # deja el kilometraje y el combustible de salida —que son del auto
        # viejo— colgando del nuevo. El check-in después compararía el
        # odómetro contra otro vehículo.
        #
        # El caso real ("el cliente volvió y se cambió de auto") existe, pero
        # no es una reasignación: son **dos alquileres**. Cerrar el primero con
        # su check-in real y abrir el segundo es lo único que deja los km, el
        # combustible y los daños imputados al auto que corresponde.
        #
        # Hasta hoy esto lo tapaba sólo un `disabled` en el formulario del
        # sistema interno — o sea, no lo tapaba: cualquier otro cliente de la
        # API podía hacerlo.
        if vehiculo_id is not None and reserva.alquiler is not None and reserva.vehiculo_id != vehiculo_id:
            raise ConflictError(
                "alquiler_en_curso|El vehículo ya se entregó: el kilometraje y el "
                "combustible de salida son de ese auto. Cerrá el alquiler con el "
                "check-in y abrí uno nuevo para el otro vehículo."
            )

        # Si es confirmada, no se puede cambiar cliente
        # (vehiculo_id y fechas sí, según D8)

        if conductor_id is not None:
            self._validar_conductor(conductor_id, reserva.cliente_id)

        # Se guarda antes de tocar nada: es con lo que se decide, al final, si
        # hubo reasignación de vehículo y qué hacer con el contrato (D-48).
        vehiculo_anterior = reserva.vehiculo_id

        # Usar valores actuales si no se proveen
        v_id = vehiculo_id or reserva.vehiculo_id
        f_inicio = fecha_inicio or reserva.fecha_inicio
        h_inicio = hora_inicio or reserva.hora_inicio
        f_fin = fecha_fin or reserva.fecha_fin
        h_fin = hora_fin or reserva.hora_fin

        inicio_dt = datetime.combine(f_inicio, h_inicio)
        fin_dt = datetime.combine(f_fin, h_fin)

        if inicio_dt >= fin_dt:
            raise BusinessRuleError("fechas_invalidas", "La fecha de fin debe ser posterior a la de inicio")

        # Re-verificar solapamiento con el nuevo rango/vehículo
        ventanas = self._cargar_ventanas(v_id)
        resultado = detectar_solapamientos(v_id, inicio_dt, fin_dt, ventanas, excluir_id=id)

        if resultado.hay_conflicto_bloqueante:
            raise self._error_conflicto(resultado.conflictos_bloqueantes[0])

        warnings = [
            {"tipo": "solape_con_pendiente", "reserva_id": v.id}
            for v in resultado.conflictos_advertencia
        ]

        with self.db.begin_nested():
            kwargs = {}
            if vehiculo_id is not None:
                kwargs["vehiculo_id"] = vehiculo_id
            if conductor_id is not None:
                kwargs["conductor_id"] = conductor_id
            if fecha_inicio is not None:
                kwargs["fecha_inicio"] = fecha_inicio
            if hora_inicio is not None:
                kwargs["hora_inicio"] = hora_inicio
            if fecha_fin is not None:
                kwargs["fecha_fin"] = fecha_fin
            if hora_fin is not None:
                kwargs["hora_fin"] = hora_fin
            if lugar_entrega is not None:
                kwargs["lugar_entrega"] = lugar_entrega
            if lugar_devolucion is not None:
                kwargs["lugar_devolucion"] = lugar_devolucion
            if notas is not None:
                kwargs["notas"] = notas
            if precio_total is not None:
                kwargs["precio_total"] = precio_total
            if forma_pago_prevista is not None:
                kwargs["forma_pago_prevista"] = forma_pago_prevista
            if estado_pago is not None:
                kwargs["estado_pago"] = estado_pago
            if anticipo_monto is not None:
                kwargs["anticipo_monto"] = anticipo_monto
            if anticipo_fecha is not None:
                kwargs["anticipo_fecha"] = anticipo_fecha
            if anticipo_medio_pago is not None:
                kwargs["anticipo_medio_pago"] = anticipo_medio_pago
            self.reserva_repo.update(reserva, **kwargs)

            # Los adicionales se sincronizan después de aplicar las fechas
            # nuevas: si la reserva se alargó, los que se cobran por día
            # tienen que rendir la duración nueva, no la vieja.
            self.sincronizar_adicionales(reserva, adicionales)
            if (fecha_inicio is not None or fecha_fin is not None) and reserva.adicionales:
                self.recalcular_adicionales_por_duracion(reserva)

        # D-48: si se cambió el auto de una reserva que ya tiene contrato
        # firmado, ese contrato quedó nombrando un vehículo que no es. Se anula
        # y hay que emitir uno nuevo — el aviso viaja como warning para que el
        # operador se entere en el acto y no cuando el cliente llega.
        if vehiculo_id is not None and vehiculo_id != vehiculo_anterior:
            warnings.extend(self._avisar_contrato_por_reasignacion(reserva, usuario_id))

        self.db.refresh(reserva)
        return reserva, warnings

    def _avisar_contrato_por_reasignacion(self, reserva, usuario_id: int) -> list[dict]:
        """
        Qué pasa con el contrato cuando se le cambia el auto a la reserva.

        **Un contrato firmado que nombra otro vehículo no sirve** para lo único
        que importa cuando hay un reclamo: identificar qué auto se entregó. Por
        eso se anula (D-48) y el cliente firma de nuevo.

        Se anula **sólo si estaba firmado**. Si todavía no lo firmó, alcanza con
        que el contrato se regenere con los datos nuevos por el camino normal:
        anularlo agregaría un número de contrato muerto sin ningún beneficio.
        """
        from app.services.contrato_service import ContratoService

        svc = ContratoService(self.db)
        contrato = svc.de_reserva(reserva.id)
        if contrato is None or contrato.anulado:
            return []

        if not contrato.firmado:
            return [{
                "tipo": "contrato_a_regenerar",
                "contrato_id": contrato.id,
                "mensaje": (
                    f"El contrato {contrato.numero_formateado} se emitió para el "
                    "vehículo anterior. Volvé a emitirlo antes de mandarlo a firmar."
                ),
            }]

        svc.anular(
            contrato.id,
            motivo="Se reasignó el vehículo de la reserva (D-48)",
            usuario_id=usuario_id,
        )
        return [{
            "tipo": "contrato_anulado_por_reasignacion",
            "contrato_id": contrato.id,
            "mensaje": (
                f"Se anuló el contrato {contrato.numero_formateado}, que estaba "
                "firmado para el vehículo anterior. Hay que emitir uno nuevo y "
                "que el cliente lo firme de nuevo."
            ),
        }]

    # ── Confirmar reserva ─────────────────────────────────────────────────────

    def confirmar(self, id: int, usuario_id: int) -> Reserva:
        """
        Confirma una reserva pendiente.
        Re-verifica solapamientos (puede haber cambiado desde el create).
        Actualiza estado del vehículo si corresponde.
        """
        reserva = self.get(id)
        if reserva.estado != EstadoReserva.PENDIENTE.value:
            raise ConflictError(f"estado_invalido|Solo se pueden confirmar reservas pendientes (estado actual: {reserva.estado})")

        # Re-verificar solapamiento al momento de confirmar
        inicio_dt = datetime.combine(reserva.fecha_inicio, reserva.hora_inicio)
        fin_dt = datetime.combine(reserva.fecha_fin, reserva.hora_fin)
        ventanas = self._cargar_ventanas(reserva.vehiculo_id)
        resultado = detectar_solapamientos(
            reserva.vehiculo_id, inicio_dt, fin_dt, ventanas, excluir_id=id
        )
        if resultado.hay_conflicto_bloqueante:
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|No se puede confirmar: hay una reserva {conflicto.estado} solapada|{conflicto.id}"
            )

        # Usar el precio manual si existe, sino calcularlo
        if reserva.precio_total is not None:
            precio = reserva.precio_total
            tarifa_id = reserva.tarifa_aplicada_id
        else:
            # Calcular tarifa y precio total
            duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)
            tarifas_info, categoria_id = self._cargar_tarifas_info(reserva.vehiculo_id)
            try:
                cot = cotizar_por_bandas(
                    duracion, tarifas_info, categoria_id, canal_de_origen(reserva.origen)
                )
                precio = cot.total
                tarifa_id = cot.tarifa_principal.id
            except BusinessRuleError:
                # Si no hay tarifa configurada, igualmente se confirma pero sin precio
                tarifa_id = None
                precio = None

        # Marcar otras reservas pendientes solapadas como bloqueadas_por_solape
        for v in resultado.conflictos_advertencia:
            reserva_pendiente = self.reserva_repo.get(v.id)
            if reserva_pendiente:
                self.reserva_repo.update(reserva_pendiente, bloqueada_por_solape=True)

        with self.db.begin_nested():
            # Cambiar estado de la reserva
            self.reserva_repo.update(
                reserva,
                estado=EstadoReserva.CONFIRMADA.value,
                tarifa_aplicada_id=tarifa_id,
                precio_total=precio,
            )
            # Actualizar estado del vehículo
            vehiculo = reserva.vehiculo
            nuevo_estado = estado_tras_confirmar_reserva(
                EstadoVehiculo(vehiculo.estado)
            )
            if nuevo_estado.value != vehiculo.estado:
                vehiculo.estado = nuevo_estado.value

        self.db.refresh(reserva)
        return reserva

    # ── Cancelar reserva ──────────────────────────────────────────────────────

    def cancelar(self, id: int, usuario_id: int, motivo: str) -> Reserva:
        """
        Cancela una reserva pendiente o confirmada.

        D-11: la seña (anticipo) no se devuelve — si había una cargada, se
        registra como ingreso (débito por cancelación + crédito por lo ya
        cobrado, que se cancelan entre sí en el saldo pero quedan en el
        historial de la cuenta corriente). Motivo obligatorio.
        """
        reserva = self.get(id)
        if reserva.estado not in (EstadoReserva.PENDIENTE.value, EstadoReserva.CONFIRMADA.value):
            raise ConflictError(f"estado_invalido|No se puede cancelar una reserva en estado '{reserva.estado}'")
        if not motivo or not motivo.strip():
            raise BusinessRuleError("motivo_requerido", "Cancelar una reserva requiere un motivo")

        era_confirmada = reserva.estado == EstadoReserva.CONFIRMADA.value

        with self.db.begin_nested():
            if reserva.anticipo_monto and reserva.anticipo_monto > 0:
                fecha_hoy = date.today()
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    concepto=f"Cancelación de reserva #{reserva.id} — seña retenida (no reembolsable)",
                    monto=reserva.anticipo_monto,
                    fecha=fecha_hoy,
                    creado_por=usuario_id,
                    reserva_id=reserva.id,
                )
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="credito",
                    concepto=f"Seña ya abonada — reserva #{reserva.id} ({reserva.anticipo_medio_pago or 'medio no especificado'})",
                    monto=reserva.anticipo_monto,
                    fecha=reserva.anticipo_fecha or fecha_hoy,
                    creado_por=usuario_id,
                    reserva_id=reserva.id,
                )

            self.reserva_repo.update(reserva, estado=EstadoReserva.CANCELADA.value, motivo_cancelacion=motivo)

            # Actualizar estado del vehículo si era confirmada
            if era_confirmada:
                otras = self.reserva_repo.count_confirmadas_activas(
                    reserva.vehiculo_id, excluir_id=id
                )
                vehiculo = reserva.vehiculo
                nuevo_estado = estado_tras_cancelar_reserva_confirmada(
                    EstadoVehiculo(vehiculo.estado),
                    tiene_otras_reservas_confirmadas=(otras > 0),
                )
                if nuevo_estado.value != vehiculo.estado:
                    vehiculo.estado = nuevo_estado.value

            auditoria_service.registrar(
                self.db,
                usuario_id=usuario_id,
                accion="cancelar",
                entidad_tipo="reserva",
                entidad_id=reserva.id,
                descripcion=(
                    f"Canceló la reserva #{reserva.id} "
                    f"({reserva.vehiculo.patente if reserva.vehiculo else 'sin vehículo'}, "
                    f"{reserva.fecha_inicio} a {reserva.fecha_fin}). Motivo: {motivo}"
                ),
                datos_antes={"estado": EstadoReserva.CONFIRMADA.value if era_confirmada else EstadoReserva.PENDIENTE.value},
                datos_despues={
                    "estado": EstadoReserva.CANCELADA.value,
                    "motivo": motivo,
                    "sena_retenida": reserva.anticipo_monto,
                },
                monto=reserva.anticipo_monto,
            )

        self.db.refresh(reserva)
        return reserva

    # ── Inactivación de vehículo con reservas (D4) ────────────────────────────

    def get_reservas_afectadas_por_inactivacion(self, vehiculo_id: int) -> list[Reserva]:
        """Dry-run: lista reservas que se verían afectadas por inactivar el vehículo."""
        return self.reserva_repo.find_activas_para_vehiculo(vehiculo_id)

    def reasignar(
        self,
        reserva_id: int,
        nuevo_vehiculo_id: int,
        usuario_id: int,
        precio_total: Decimal | None = None,
        precio_motivo: str | None = None,
    ) -> tuple[Reserva, list[dict]]:
        """
        Reasigna una reserva a otro vehículo (D4).
        Solo para reservas pendientes o confirmadas.
        Re-verifica solapamientos en el vehículo destino.

        **`precio_total` corrige el precio en el mismo paso (D-65).** Sin esto,
        cambiar de auto obligaba a elegir entre entregar el vehículo que hay o
        respetar el precio pactado: si el reemplazo es de otra categoría, una de
        las dos cosas se rompe.

        Sigue el mismo criterio que el resto de la plata del sistema (regla
        1.7): si el precio nuevo difiere del que había, **el motivo es
        obligatorio** y queda auditado. No es un campo libre sin rastro.
        """
        reserva = self.get(reserva_id)
        if reserva.estado not in (EstadoReserva.PENDIENTE.value, EstadoReserva.CONFIRMADA.value):
            raise ConflictError(f"estado_invalido|No se puede reasignar una reserva en estado '{reserva.estado}'")

        nuevo_vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == nuevo_vehiculo_id).first()
        if not nuevo_vehiculo or not nuevo_vehiculo.activo:
            raise NotFoundError("Vehículo destino", nuevo_vehiculo_id)

        inicio_dt = datetime.combine(reserva.fecha_inicio, reserva.hora_inicio)
        fin_dt = datetime.combine(reserva.fecha_fin, reserva.hora_fin)
        ventanas = self._cargar_ventanas(nuevo_vehiculo_id)
        resultado = detectar_solapamientos(nuevo_vehiculo_id, inicio_dt, fin_dt, ventanas)

        if resultado.hay_conflicto_bloqueante:
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|Conflicto en vehículo destino|{conflicto.id}|{conflicto.estado}"
            )

        warnings = [
            {"tipo": "solape_con_pendiente", "reserva_id": v.id}
            for v in resultado.conflictos_advertencia
        ]

        anterior = reserva.vehiculo_id
        precio_anterior = reserva.precio_total

        cambia_precio = (
            precio_total is not None
            and precio_anterior is not None
            and Decimal(str(precio_total)) != Decimal(str(precio_anterior))
        )
        if cambia_precio and not (precio_motivo or "").strip():
            raise BusinessRuleError(
                "motivo_requerido",
                "Cambiar el precio al reasignar exige un motivo.",
            )

        with self.db.begin_nested():
            campos = {"vehiculo_id": nuevo_vehiculo_id}
            if precio_total is not None:
                campos["precio_total"] = precio_total
                if cambia_precio:
                    # Mismo lugar donde vive el motivo de un descuento manual:
                    # es la misma decisión —alguien se apartó del precio— y
                    # tenerla en dos campos distintos partiría el reporte.
                    campos["descuento_motivo"] = precio_motivo.strip()
                    campos["descuento_autorizado_por"] = usuario_id
            self.reserva_repo.update(reserva, **campos)

            # **Esto no existía.** Cambiar el auto por D4 no dejaba ni una
            # línea de auditoría: la pantalla de Auditoría mapea la acción
            # `reasignar_vehiculo` desde hace meses y nunca la escribió nadie.
            # Sin esto, la única forma de saber que a una reserva le cambiaron
            # el auto era acordarse.
            auditoria_service.registrar(
                self.db,
                usuario_id=usuario_id,
                accion="reasignar_vehiculo",
                entidad_tipo="reserva",
                entidad_id=reserva.id,
                descripcion=(
                    f"Reasignó la reserva #{reserva.id} a {nuevo_vehiculo.patente} "
                    f"(D4: el vehículo anterior se dio de baja)"
                ),
                datos_antes={
                    "vehiculo_id": anterior,
                    "precio_total": str(precio_anterior) if precio_anterior is not None else None,
                },
                datos_despues={
                    "vehiculo_id": nuevo_vehiculo_id,
                    "precio_total": str(precio_total) if precio_total is not None else None,
                    "motivo_precio": precio_motivo if cambia_precio else None,
                },
            )

        # D-48, igual que en `asignar_vehiculo` y en `update`. Faltaba también
        # acá: se reasignaba por baja del vehículo y el contrato seguía
        # nombrando un auto que ya no existe en la flota.
        if anterior != nuevo_vehiculo_id:
            warnings.extend(self._avisar_contrato_por_reasignacion(reserva, usuario_id))

        self.db.refresh(reserva)
        return reserva, warnings

    def get_reservas_a_reasignar(self) -> list[Reserva]:
        """Vista D4: reservas de vehículos inactivos que necesitan reasignación."""
        return self.reserva_repo.find_a_reasignar()

    # ── Resolver una reserva que llegó sin plata y sin auto ───────────────────
    #
    # Es el caso de la reserva web por transferencia: entra en
    # `pendiente_pago`, sin vehículo, y **no se confirma sola** — no hay
    # webhook. El cliente manda el comprobante por WhatsApp y alguien concilia
    # contra el extracto. Los dos pasos que faltan son cobrar y asignar, y
    # están acá para que el operador no tenga que saber en qué orden van.

    # Centinela para `asignar_vehiculo`: hace falta distinguir "no me importa
    # qué auto tiene" de "esperaba que no tuviera ninguno", y `None` es un
    # valor legítimo de los dos lados.
    SIN_CHEQUEO = object()

    # Los estados en los que todavía se puede cobrar una seña o mover el auto:
    # antes del checkout. Después el dinero entra como `Pago` del alquiler y
    # el auto ya está en la calle.
    ESTADOS_RESOLUBLES = (
        EstadoReserva.PENDIENTE.value,
        EstadoReserva.PENDIENTE_PAGO.value,
        EstadoReserva.CONFIRMADA.value,
        EstadoReserva.REVISION_SIN_CUPO.value,
        EstadoReserva.SIN_DISPONIBILIDAD.value,
    )

    def total_a_cobrar(self, reserva: Reserva) -> Decimal:
        """
        Todo lo que la reserva tiene que terminar pagando.

        Los adicionales y el late checkout viven **fuera** de `precio_total`
        (ver `Reserva.total_adicionales`), así que un saldo calculado sólo
        contra `precio_total` cobra de menos.
        """
        return (
            Decimal(str(reserva.precio_total or 0))
            + Decimal(str(reserva.cargo_late_checkout or 0))
            + Decimal(str(reserva.total_adicionales))
        )

    def saldo_pendiente(self, reserva: Reserva) -> Decimal:
        return self.total_a_cobrar(reserva) - Decimal(str(reserva.anticipo_monto or 0))

    def registrar_cobro(
        self,
        reserva_id: int,
        monto: Decimal,
        medio_pago: str,
        usuario_id: int,
        fecha: date | None = None,
        referencia: str | None = None,
        confirmar: bool = True,
    ) -> Reserva:
        """
        Registra plata que **ya entró** por una reserva todavía sin checkout, y
        —si se pide— la confirma en el mismo movimiento.

        Es un paso solo a propósito: la transferencia web llega, alguien la ve
        en el extracto, y confirmar la reserva después de cargar el monto no
        es una segunda decisión sino la misma. Separarlas garantizaba reservas
        cobradas que nadie confirmó.

        **No crea un `Pago`.** Se acumula en `anticipo_monto`, que es el mismo
        lugar donde el mostrador guarda una seña, y `AlquilerService.checkout`
        lo convierte en `Pago` + crédito en cuenta corriente cuando el auto
        sale. Crear el `Pago` acá lo duplicaría en el checkout, y esa cuenta
        doble se descubriría recién al cerrar la caja.

        Se **suma** a lo ya cobrado: una reserva puede recibir la seña por
        transferencia y un refuerzo después, y pisar el monto perdería el
        primero.
        """
        reserva = self.get(reserva_id)

        if reserva.alquiler is not None:
            raise BusinessRuleError(
                "alquiler_en_curso",
                "El auto ya salió: los cobros de un alquiler en curso se "
                "registran desde Caja, no desde la reserva",
            )
        if reserva.estado not in self.ESTADOS_RESOLUBLES:
            raise ConflictError(
                f"estado_invalido|No se puede registrar un cobro sobre una "
                f"reserva en estado '{reserva.estado}'"
            )

        monto = Decimal(str(monto))
        if monto <= 0:
            raise BusinessRuleError(
                "monto_invalido", "El monto cobrado tiene que ser mayor a cero"
            )

        fecha = fecha or date.today()
        if fecha > date.today():
            raise BusinessRuleError(
                "fecha_futura",
                "No se puede registrar un cobro con fecha futura: se carga "
                "cuando la plata entró",
            )

        cobrado_antes = Decimal(str(reserva.anticipo_monto or 0))
        cobrado_ahora = cobrado_antes + monto
        total = self.total_a_cobrar(reserva)
        estado_antes = reserva.estado

        with self.db.begin_nested():
            reserva.anticipo_monto = cobrado_ahora
            reserva.anticipo_fecha = fecha
            reserva.anticipo_medio_pago = medio_pago
            # Sin precio cargado no se puede afirmar que esté pagada: queda
            # como anticipo, que es lo único cierto.
            reserva.estado_pago = (
                "pagado" if total > 0 and cobrado_ahora >= total else "anticipo"
            )
            if referencia:
                marca = f"Cobro {fecha.isoformat()} — {medio_pago}: {referencia}"
                reserva.notas = f"{reserva.notas}\n{marca}" if reserva.notas else marca

            if confirmar and reserva.estado != EstadoReserva.CONFIRMADA.value:
                reserva.estado = EstadoReserva.CONFIRMADA.value
                # La bandeja web se vacía sola: una reserva resuelta no puede
                # seguir figurando como pendiente de decisión.
                if reserva.origen == "web":
                    reserva.web_resuelta_por = usuario_id
                    reserva.web_resuelta_en = datetime.utcnow()

            auditoria_service.registrar(
                self.db,
                usuario_id=usuario_id,
                accion="registrar_cobro_reserva",
                entidad_tipo="reserva",
                entidad_id=reserva.id,
                descripcion=(
                    f"Cobró ${monto} por {medio_pago} de la reserva #{reserva.id}"
                    + (f" (ref: {referencia})" if referencia else "")
                ),
                datos_antes={"estado": estado_antes, "anticipo_monto": float(cobrado_antes)},
                datos_despues={
                    "estado": reserva.estado,
                    "anticipo_monto": float(cobrado_ahora),
                    "estado_pago": reserva.estado_pago,
                    "medio_pago": medio_pago,
                },
                monto=monto,
            )

        # Confirmar la reserva por transferencia es lo que cierra
        # "esperando la transferencia" (C-4): si no se resuelve acá, la regla
        # del catálogo la sigue reclamando cada corrida del motor.
        if confirmar and reserva.estado == EstadoReserva.CONFIRMADA.value:
            from app.services.notificacion_service import NotificacionService
            NotificacionService(self.db).resolver_por_entidad("reserva", reserva.id, usuario_id)

        self.db.refresh(reserva)
        return reserva

    def asignar_vehiculo(
        self,
        reserva_id: int,
        vehiculo_id: int,
        usuario_id: int,
        confirmar: bool = False,
        upgrade_motivo: str | None = None,
        vehiculo_esperado=SIN_CHEQUEO,
    ) -> tuple[Reserva, list[dict]]:
        """
        Le pone un auto concreto a una reserva que no lo tiene (o le cambia el
        que tenía).

        D-47: **asignar el vehículo es lo que habilita el contrato.** Hasta que
        no hay un auto puntual no hay nada que firmar, porque una categoría no
        se entrega. Por eso este es el paso que dispara la oferta de emitirlo.

        Se diferencia de `reasignar` (D4, vehículo dado de baja) en que acepta
        una reserva **sin** vehículo y en que puede confirmarla: es el camino
        de la reserva web, que llega por categoría.

        La disponibilidad se revalida contra el auto elegido en este momento y
        no se confía en la lista que se vio al abrir la pantalla: entre listar
        y asignar pueden pasar horas.

        **D-54 (plan de conexión 13/08):** si el auto es de otra categoría que
        la pedida, queda registrado en `categoria_entregada_id` —
        `categoria_id` sigue siendo la pedida, el cupo se sigue contando
        igual— y en `upgrade_motivo`. Es lo único que permite después
        contestar "¿cuántos upgrades regalamos este verano?", y lo que deja
        una marca si en algún momento se entregó una categoría **peor** que la
        pedida en vez de mejor.
        """
        reserva = self.get(reserva_id)

        # Concurrencia optimista. Son hasta tres personas usando el sistema a
        # la vez y el aviso de reservas pendientes le aparece a todas: dos
        # pueden abrir la misma y asignarle autos distintos. El segundo pisaba
        # al primero en silencio, y quedaba un auto comprometido que el
        # calendario ya no mostraba reservado.
        #
        # No hace falta un lock ni saber quién la tiene abierta: alcanza con
        # que quien asigna diga qué creía que había. Si no coincide, perdió.
        if (
            vehiculo_esperado is not self.SIN_CHEQUEO
            and reserva.vehiculo_id != vehiculo_esperado
        ):
            raise ConflictError(
                "reasignado_por_otro|Alguien más le asignó un auto a esta "
                "reserva mientras la tenías abierta. Recargá para ver cuál."
            )

        if reserva.estado not in self.ESTADOS_RESOLUBLES:
            raise ConflictError(
                f"estado_invalido|No se puede asignar un vehículo a una "
                f"reserva en estado '{reserva.estado}'"
            )
        if reserva.alquiler is not None:
            # "Revertir el checkout" **no existe en el sistema**, así que el
            # mensaje viejo mandaba a hacer algo imposible. Lo que hay que
            # hacer son dos alquileres: cerrar éste con su check-in real y
            # abrir otro para el auto nuevo — es lo único que deja los km y el
            # combustible imputados al vehículo que corresponde.
            raise BusinessRuleError(
                "alquiler_en_curso",
                "El auto ya se entregó. Cerrá el alquiler con el check-in y abrí "
                "uno nuevo para el otro vehículo: el kilometraje y el combustible "
                "de salida son de este auto.",
            )

        vehiculo = self.db.get(Vehiculo, vehiculo_id)
        if not vehiculo or not vehiculo.activo:
            raise NotFoundError("Vehículo", vehiculo_id)

        anterior = reserva.vehiculo_id
        estado_antes = reserva.estado

        self._lock_vehiculo(vehiculo_id)
        self.validar_disponibilidad_vehiculo(
            vehiculo_id,
            reserva.fecha_inicio, reserva.hora_inicio,
            reserva.fecha_fin, reserva.hora_fin,
            excluir_reserva_id=reserva.id,
        )

        # D-54: ¿la categoría del auto entregado difiere de la pedida? Se
        # compara contra `categoria_id` —la pedida, nunca se toca— y no
        # contra el vehículo anterior: lo que importa es qué prometió la
        # reserva, no qué auto tenía puesto un minuto antes.
        es_otra_categoria = (
            reserva.categoria_id is not None
            and vehiculo.categoria_id is not None
            and vehiculo.categoria_id != reserva.categoria_id
        )
        if es_otra_categoria:
            categoria_pedida = self.db.get(Categoria, reserva.categoria_id)
            es_downgrade = (
                categoria_pedida is not None
                and vehiculo.categoria is not None
                and vehiculo.categoria.orden < categoria_pedida.orden
            )
            motivo_final = upgrade_motivo or (
                "Downgrade: se entregó una categoría inferior a la pedida — revisar"
                if es_downgrade else
                "Upgrade a categoría superior, mismo precio (D-54)"
            )

        with self.db.begin_nested():
            reserva.vehiculo_id = vehiculo_id
            if es_otra_categoria:
                reserva.categoria_entregada_id = vehiculo.categoria_id
                reserva.upgrade_motivo = motivo_final
            elif reserva.categoria_entregada_id is not None:
                # Volvió a asignarse un auto de la categoría pedida: la
                # cortesía ya no aplica, no puede quedar la marca vieja.
                reserva.categoria_entregada_id = None
                reserva.upgrade_motivo = None
            if confirmar and reserva.estado != EstadoReserva.CONFIRMADA.value:
                reserva.estado = EstadoReserva.CONFIRMADA.value
                if reserva.origen == "web":
                    reserva.web_resuelta_por = usuario_id
                    reserva.web_resuelta_en = datetime.utcnow()

            auditoria_service.registrar(
                self.db,
                usuario_id=usuario_id,
                accion="asignar_vehiculo",
                entidad_tipo="reserva",
                entidad_id=reserva.id,
                descripcion=(
                    f"Asignó {vehiculo.patente} a la reserva #{reserva.id}"
                    + (f" (antes: vehículo {anterior})" if anterior else " (no tenía auto)")
                ),
                datos_antes={"vehiculo_id": anterior, "estado": estado_antes},
                datos_despues={"vehiculo_id": vehiculo_id, "estado": reserva.estado},
            )

        # Asignar el auto es lo que resuelve "reserva web sin asignar" (C-1):
        # sin esto, la notificación instantánea (`avisar_reserva_web`,
        # autoresoluble=False) queda activa para siempre aunque ya se haya
        # resuelto, y la regla del catálogo homónima la sigue reclamando cada
        # corrida del motor hasta la próxima medianoche.
        from app.services.notificacion_service import NotificacionService
        NotificacionService(self.db).resolver_por_entidad("reserva", reserva.id, usuario_id)

        # D-48. **Esto faltaba acá y estaba sólo en `update()`.** Cambiar el
        # auto por esta vía dejaba el contrato nombrando la patente vieja, y
        # un contrato firmado que nombra otro vehículo no sirve para lo único
        # que importa en un reclamo: identificar qué auto se entregó.
        #
        # Sólo cuando el auto **cambia**. En la primera asignación no hay
        # contrato que tocar: sin auto no se podía emitir (D-47).
        warnings: list[dict] = []
        if anterior is not None and anterior != vehiculo_id:
            warnings.extend(self._avisar_contrato_por_reasignacion(reserva, usuario_id))

        self.db.refresh(reserva)
        return reserva, warnings

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _lock_vehiculo(self, vehiculo_id: int | None) -> None:
        """
        Serializa las reservas de **un** vehículo hasta que termine la
        transacción.

        Es un `SELECT ... FOR UPDATE` sobre la fila del vehículo, el mismo
        patrón que `HoldService` usa sobre la categoría. No bloquea la tabla:
        dos personas reservando autos distintos siguen trabajando en paralelo,
        y la única espera posible es sobre el mismo auto — que es exactamente
        el caso que hay que serializar.

        Con `vehiculo_id` en `None` no hay nada que bloquear: una reserva por
        categoría no compite por un auto puntual sino por el cupo, y ése lo
        serializa `HoldService` sobre la categoría.
        """
        if vehiculo_id is None:
            return
        self.db.execute(
            select(Vehiculo.id).where(Vehiculo.id == vehiculo_id).with_for_update()
        ).first()

    def validar_disponibilidad_vehiculo(
        self,
        vehiculo_id: int,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
        excluir_reserva_id: int | None = None,
    ) -> None:
        """
        ¿Este auto está libre en este rango? Levanta `ConflictError` si no.

        Lo usa la bandeja de reservas web al asignar un vehículo a una reserva
        por categoría. **Revalida en el momento de aceptar** y no confía en lo
        que se vio al abrir la bandeja: entre listar y aceptar pueden pasar
        horas y entrar otra reserva sobre el mismo auto.

        Pasa por el mismo `detectar_solapamientos` que todo lo demás — una
        segunda validación paralela terminaría divergiendo.
        """
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)
        ventanas = [
            v for v in self._cargar_ventanas(vehiculo_id)
            if excluir_reserva_id is None or v.id != excluir_reserva_id
        ]
        resultado = detectar_solapamientos(vehiculo_id, inicio_dt, fin_dt, ventanas)
        if resultado.hay_conflicto_bloqueante:
            raise self._error_conflicto(resultado.conflictos_bloqueantes[0])

    def _cargar_ventanas(self, vehiculo_id: int) -> list[VentanaReserva]:
        """
        Carga las ventanas que ocupan el vehículo: sus reservas **y sus
        bloqueos** (mantenimiento, siniestro, uso interno).

        Los bloqueos entran acá y no en una validación aparte para que
        `detectar_solapamientos` sea el único que decide si un vehículo está
        libre. Un segundo camino de validación termina divergiendo del
        primero, y el resultado es una reserva aceptada sobre un auto que
        está en el taller.

        **Toma un lock sobre el vehículo antes de leer.** Los cinco caminos
        que llaman acá son leer-y-después-escribir: miran si el auto está
        libre y, si lo está, insertan. Sin lock, dos personas que confirman el
        mismo auto en el mismo instante leen las dos "libre" y graban las dos
        — el sistema queda con el auto doblemente reservado y nadie se entera
        hasta el día de la entrega. Son tres personas trabajando a la vez
        sobre la misma flota, así que la ventana es chica pero real.

        El lock va acá y no en cada caller por lo mismo que los bloqueos: un
        segundo camino termina divergiendo. Es sobre la fila del vehículo, no
        sobre la tabla, así que dos reservas de autos distintos no se estorban.
        """
        self._lock_vehiculo(vehiculo_id)
        reservas = self.reserva_repo.list(vehiculo_id=vehiculo_id, page=1, page_size=9999)[0]

        ventanas = self._cargar_ventanas_bloqueos(vehiculo_id)
        for r in reservas:
            # "vencida" ocupa el vehículo tanto como "activa": el auto sigue afuera.
            if r.estado in ("pendiente", "confirmada", "activa", "vencida"):
                ventanas.append(
                    VentanaReserva(
                        id=r.id,
                        vehiculo_id=r.vehiculo_id,
                        inicio=datetime.combine(r.fecha_inicio, r.hora_inicio),
                        fin=datetime.combine(r.fecha_fin, r.hora_fin),
                        estado=r.estado,
                        cliente_nombre=r.cliente.nombre_completo if r.cliente else "",
                    )
                )
        return ventanas

    @staticmethod
    def _error_conflicto(conflicto: VentanaReserva) -> ConflictError:
        """
        Arma el 409 distinguiendo si el que ocupa el vehículo es otra reserva
        o un bloqueo. Decir "tiene una reserva bloqueo en ese rango" no le
        sirve a nadie: quien carga necesita saber que el auto está en el
        taller para poder ofrecer otro.
        """
        if conflicto.tipo == "bloqueo":
            # La ventana termina a las 00:00 del día siguiente; se muestra el
            # último día realmente bloqueado.
            ultimo_dia = (conflicto.fin - timedelta(days=1)).date()
            return ConflictError(
                f"vehiculo_bloqueado|El vehículo no está disponible en ese rango "
                f"({conflicto.cliente_nombre})|"
                f"{conflicto.id}|bloqueo|{conflicto.inicio.date()}|{ultimo_dia}"
            )
        return ConflictError(
            f"solapamiento|El vehículo tiene una reserva {conflicto.estado} en ese rango|"
            f"{conflicto.id}|{conflicto.estado}|{conflicto.inicio.date()}|{conflicto.fin.date()}"
        )

    def _cargar_ventanas_bloqueos(self, vehiculo_id: int) -> list[VentanaReserva]:
        """
        Bloqueos activos del vehículo, como ventanas ocupadas.

        El rango del bloqueo es inclusivo en los dos extremos (del 3 al 5 son
        tres días completos), así que la ventana termina a las 00:00 del día
        SIGUIENTE a `fecha_hasta`. Si terminara a las 00:00 del mismo día, un
        bloqueo de un solo día tendría duración cero y no bloquearía nada.
        """
        bloqueos = (
            self.db.query(BloqueoVehiculo)
            .filter(
                BloqueoVehiculo.vehiculo_id == vehiculo_id,
                BloqueoVehiculo.activo.is_(True),
            )
            .all()
        )
        return [
            VentanaReserva(
                id=b.id,
                vehiculo_id=b.vehiculo_id,
                inicio=datetime.combine(b.fecha_desde, time.min),
                fin=datetime.combine(b.fecha_hasta + timedelta(days=1), time.min),
                estado="bloqueo",
                cliente_nombre=MOTIVO_BLOQUEO_LABEL.get(b.motivo, b.motivo),
                tipo="bloqueo",
            )
            for b in bloqueos
        ]

    def _cargar_tarifas_info(
        self, vehiculo_id: int | None, categoria_id: int | None = None
    ) -> tuple[list[TarifaInfo], int | None]:
        """Carga las tarifas activas relevantes: las específicas del vehículo,
        las de su categoría, y las generales. Devuelve (tarifas, categoria_id).

        `vehiculo_id` puede ser None en una reserva por categoría (ítem 58):
        en ese caso se cotiza contra la categoría recibida y sólo entran las
        tarifas de categoría y las generales — no hay auto del cual tomar una
        tarifa puntual."""
        if vehiculo_id is not None:
            vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id).first()
            categoria_id = vehiculo.categoria_id if vehiculo else categoria_id

        tarifas = (
            self.db.query(Tarifa)
            .filter(
                Tarifa.activo == True,
                (Tarifa.vehiculo_id == vehiculo_id) | (Tarifa.vehiculo_id.is_(None)),
            )
            .all()
        )
        from app.domain.enums import TipoTarifa
        tarifas_info = [
            TarifaInfo(
                id=t.id,
                tipo=TipoTarifa(t.tipo),
                monto=Decimal(str(t.monto)),
                vehiculo_id=t.vehiculo_id,
                categoria_id=t.categoria_id,
                # **El canal tiene que viajar.** Sin esto toda tarifa entraba
                # al motor como `ambos` sin importar cómo estuviera cargada, y
                # una tarifa marcada sólo para web se cobraba también en el
                # mostrador (y al revés) — que es exactamente lo que la
                # columna `canal` de la migración 074 vino a impedir.
                canal=t.canal,
            )
            for t in tarifas
        ]
        return tarifas_info, categoria_id
