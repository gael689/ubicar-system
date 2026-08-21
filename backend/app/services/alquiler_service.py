from __future__ import annotations
"""
AlquilerService — orquesta la lógica de checkout, checkin y extensión.
"""
import logging
from datetime import datetime, date, time
from decimal import Decimal
from enum import Enum

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ConflictError, BusinessRuleError
from app.domain.control_24hs import (
    calcular_excedente, ResultadoExcedente,
    GRACIA_MINUTOS, MULTIPLICADOR_HORA_EXCEDENTE, TOPE_HORAS_ANTES_DIA_EXTRA,
)
from app.domain.cuenta_corriente import calcular_vencimiento
from app.domain.enums import EstadoReserva, EstadoVehiculo, DecisionExcedente
from app.domain.solapamientos import detectar_solapamientos
from app.domain.tarifas import (
    seleccionar_tarifa, cotizar_por_bandas, calcular_duracion_dias, canal_de_origen,
    TarifaInfo,
)
from app.domain.transiciones import estado_tras_checkout, estado_tras_checkin
from app.domain.ventana import VentanaReserva
from app.models.alquiler import Alquiler
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.pago import Pago
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.models.tarifa import Tarifa
from app.repositories.alquiler_repo import AlquilerRepo
from app.repositories.reserva_repo import ReservaRepo
from app.schemas.alquiler import PagoInmediato
from app.services import auditoria_service
from app.services.configuracion_service import ConfiguracionService
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.echeq_service import EcheqService

logger = logging.getLogger(__name__)


class AlquilerService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.alquiler_repo = AlquilerRepo(db)
        self.reserva_repo = ReservaRepo(db)
        self.cc_service = CuentaCorrienteService(db)
        self.config_service = ConfiguracionService(db)
        self.echeq_service = EcheqService(db)

    def _params_excedente(self) -> dict:
        """Lee gracia/multiplicador/tope de la tabla `configuracion` (Fase 3,
        ítem 40) en vez de los defaults hardcodeados del dominio. Si algún
        valor no está cargado (o no es parseable), cae al default original
        de control_24hs.py — nunca rompe el cálculo."""
        return {
            "gracia_minutos": self.config_service.get_int("excedente.gracia_minutos", GRACIA_MINUTOS),
            "multiplicador_hora": self.config_service.get_int("excedente.multiplicador_hora", MULTIPLICADOR_HORA_EXCEDENTE),
            "tope_horas": self.config_service.get_int("excedente.tope_horas_dia_extra", TOPE_HORAS_ANTES_DIA_EXTRA),
        }

    # ── Lectura ───────────────────────────────────────────────────────────────

    def get(self, id: int) -> Alquiler:
        alquiler = self.alquiler_repo.get(id)
        if not alquiler:
            raise NotFoundError("Alquiler", id)
        return alquiler

    def list(self, **filters) -> tuple[list[Alquiler], int]:
        return self.alquiler_repo.list(**filters)

    # ── Preview excedente (sin persistir) ─────────────────────────────────────

    def preview_excedente(
        self,
        alquiler_id: int,
        checkin_fecha: date,
        checkin_hora: time,
    ) -> ResultadoExcedente:
        """
        Calcula el excedente esperado para una fecha/hora de checkin propuesta.
        NO persiste nada. Usado por el frontend para preview en vivo.
        """
        alquiler = self.get(alquiler_id)
        reserva = alquiler.reserva

        if reserva.estado not in (EstadoReserva.ACTIVA.value, EstadoReserva.VENCIDA.value):
            raise BusinessRuleError("estado_invalido", "El alquiler no está activo")

        hora_devolucion = reserva.hora_devolucion_acordada or reserva.hora_inicio
        hora_devolucion_dt = datetime.combine(reserva.fecha_fin, hora_devolucion)
        checkin_dt = datetime.combine(checkin_fecha, checkin_hora)

        tarifa_diaria = self._obtener_tarifa_diaria(reserva)
        return calcular_excedente(hora_devolucion_dt, checkin_dt, tarifa_diaria, **self._params_excedente())

    # ── Checkout ──────────────────────────────────────────────────────────────

    def checkout(
        self,
        reserva_id: int,
        checkout_fecha: date,
        checkout_hora: time,
        checkout_km: int,
        checkout_combustible: int,
        checkout_descripcion: str | None,
        usuario_id: int,
        registrado_en_tiempo_real: bool = True,
        checkout_estado_limpieza: str | None = None,
        garantia_tipo: str | None = None,
        garantia_monto: Decimal | None = None,
        pago_inmediato: PagoInmediato | None = None,
        cargo_checkout_tardio: Decimal = Decimal("0"),
        motivo_checkout_tardio: str | None = None,
        motivo_sin_contrato: str | None = None,
    ) -> tuple[Alquiler, list[dict]]:
        """
        Registra el checkout de una reserva confirmada.
        Cambia estado: reserva → activa, vehículo → alquilado.

        Returns:
            (alquiler, warnings) — warnings pueden incluir contrato no firmado.
        """
        reserva = self.reserva_repo.get(reserva_id)
        if not reserva:
            raise NotFoundError("Reserva", reserva_id)

        # No se puede entregar una categoría (ítem 58): una reserva web nace
        # por categoría y alguien tiene que asignarle un auto concreto antes
        # de que el cliente se lo lleve. Es el punto donde la reserva por
        # categoría vuelve a ser una reserva de un vehículo puntual.
        if reserva.vehiculo_id is None:
            raise BusinessRuleError(
                "reserva_sin_vehiculo_asignado",
                "La reserva es por categoría y todavía no tiene un vehículo asignado. "
                "Asigná uno antes de hacer el check-out.",
            )

        # Permitimos checkout cuando la reserva está confirmada (caso normal) o
        # cuando ya transicionó automáticamente a activa por cumplirse la hora
        # pero todavía no existe un alquiler creado (caso de alerta amarilla).
        if reserva.estado == EstadoReserva.ACTIVA.value:
            existe_alquiler = (
                self.db.query(Alquiler).filter(Alquiler.reserva_id == reserva_id).first()
            )
            if existe_alquiler:
                raise ConflictError(
                    f"estado_invalido|Ya existe un alquiler para esta reserva (ID {existe_alquiler.id})"
                )
        elif reserva.estado != EstadoReserva.CONFIRMADA.value:
            raise ConflictError(
                f"estado_invalido|La reserva debe estar confirmada o activa sin alquiler (estado actual: {reserva.estado})"
            )

        # Validaciones de fecha/hora
        checkout_dt = datetime.combine(checkout_fecha, checkout_hora)
        inicio_dt = datetime.combine(reserva.fecha_inicio, reserva.hora_inicio)
        if checkout_dt < inicio_dt:
            raise BusinessRuleError(
                "checkout_antes_inicio",
                "El checkout no puede ser anterior a la fecha de inicio de la reserva",
            )
        vehiculo = reserva.vehiculo
        if checkout_km < vehiculo.km_actual:
            raise BusinessRuleError(
                "km_invalidos",
                f"El km de salida ({checkout_km}) no puede ser menor al km actual del vehículo ({vehiculo.km_actual})",
            )

        # D-34: el contrato no bloquea la entrega, pero si el auto sale sin
        # firmar se exige un motivo y queda constancia visible en la ficha y
        # en el listado. No alcanza con la advertencia: sin dejar rastro, "se
        # entregó sin contrato" se vuelve invisible al día siguiente.
        warnings = []
        sin_contrato = False
        if not reserva.alquiler or not (reserva.alquiler.contrato_firmado if reserva.alquiler else False):
            if not self._tiene_contrato_firmado(reserva_id):
                sin_contrato = True
                warnings.append({"tipo": "contrato_no_firmado", "mensaje": "El contrato aún no está firmado"})
                if not (motivo_sin_contrato or "").strip():
                    raise BusinessRuleError(
                        "motivo_sin_contrato_requerido",
                        "El vehículo se está entregando sin contrato firmado. "
                        "Indicá el motivo para dejarlo registrado.",
                    )

        with self.db.begin_nested():
            # Crear alquiler
            alquiler = Alquiler(
                reserva_id=reserva_id,
                checkout_fecha=checkout_fecha,
                checkout_hora=checkout_hora,
                checkout_km=checkout_km,
                checkout_combustible=checkout_combustible,
                checkout_descripcion=checkout_descripcion,
                checkout_registrado_en_tiempo_real=registrado_en_tiempo_real,
                checkout_estado_limpieza=checkout_estado_limpieza,
                entregado_sin_contrato=sin_contrato,
                motivo_sin_contrato=motivo_sin_contrato if sin_contrato else None,
                garantia_tipo=garantia_tipo,
                garantia_monto=garantia_monto,
                garantia_estado="retenida" if garantia_tipo and garantia_tipo != "no_aplica" else None,
                horas_excedidas=Decimal("0"),
                cargo_excedente=Decimal("0"),
                excedente_bonificado=False,
                decidido_por=usuario_id,
                cargo_checkout_tardio=cargo_checkout_tardio,
                motivo_checkout_tardio=motivo_checkout_tardio,
            )
            self.alquiler_repo.create(alquiler)
            self.db.flush()  # Para obtener alquiler.id

            # El echeq de esta reserva (si lo hay) se creó antes de que
            # existiera este Alquiler — recién ahora se puede completar el
            # vínculo (mismo patrón que fecha_vencimiento en condicion_pago).
            self.echeq_service.completar_alquiler(reserva.id, alquiler.id)


            # El contrato también puede haberse emitido antes de esta entrega
            # —es lo deseable, da tiempo a leerlo— así que acá se completa el
            # vínculo con la operación real y se refleja si estaba firmado.
            # Sin esto, `entregado_sin_contrato` diría que el auto salió sin
            # papel aunque el cliente lo hubiera firmado la semana pasada.
            from app.services.contrato_service import ContratoService

            contrato = ContratoService(self.db).de_reserva(reserva.id)
            if contrato is not None:
                contrato.alquiler_id = alquiler.id
                alquiler.contrato_firmado = contrato.firmado

            # Ledger completo: el checkout factura el alquiler completo como
            # un débito automático en la cuenta corriente del cliente,
            # exista o no un pago inmediato. Cualquier cobro (abajo) genera
            # el crédito que lo cancela — total o parcialmente.
            monto_facturado = (
                (reserva.precio_total or Decimal("0"))
                + (reserva.cargo_late_checkout or Decimal("0"))
                + (cargo_checkout_tardio or Decimal("0"))
                # Coberturas y extras contratados: viven fuera de precio_total
                # (ver Reserva.total_adicionales) y se facturan acá, junto con
                # el resto de los conceptos.
                + reserva.total_adicionales
            )
            debito_alquiler = None
            if monto_facturado > 0:
                # Condición de pago: decisión de la reserva (D-?), no el
                # default del cliente. Si el ancla es 'checkin', todavía no
                # sabemos cuándo vuelve el auto — queda sin vencimiento hasta
                # que el check-in lo complete (o alguien lo edite a mano).
                ancla = reserva.condicion_pago_ancla
                fecha_vencimiento_checkout = None
                provisorio = False
                if ancla == "fecha_especifica" and reserva.condicion_pago_fecha_ancla:
                    fecha_vencimiento_checkout = calcular_vencimiento(
                        reserva.condicion_pago_fecha_ancla, reserva.condicion_pago
                    )
                elif ancla == "checkin":
                    # **Nace con una fecha estimada, no sin fecha.** Se calcula
                    # desde el fin **pactado** de la reserva, que es lo mejor que
                    # se sabe al entregar el auto, y el check-in real la
                    # recalcula. Antes quedaba en NULL, y un débito sin
                    # vencimiento es invisible para los avisos de deuda: podían
                    # ser $400.000 esperando a que alguien cargara el check-in.
                    fecha_vencimiento_checkout = calcular_vencimiento(
                        reserva.fecha_fin, reserva.condicion_pago
                    )
                    provisorio = True
                debito_alquiler = self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    naturaleza="alquiler",
                    concepto=f"Alquiler #{reserva.id} — checkout ({reserva.vehiculo.patente if reserva.vehiculo else ''})",
                    monto=monto_facturado,
                    fecha=checkout_fecha,
                    creado_por=usuario_id,
                    condicion=reserva.condicion_pago,
                    fecha_vencimiento=fecha_vencimiento_checkout,
                    sin_vencimiento_automatico=(ancla == "checkin"),
                    vencimiento_provisorio=provisorio,
                    alquiler_id=alquiler.id,
                    reserva_id=reserva.id,
                )

            # ── La seña ya es un crédito: acá sólo se marca aplicada ─────
            #
            # Hasta la Fase 2 este bloque **fabricaba** el `Pago` y el crédito a
            # partir de `reserva.anticipo_monto`, con una guarda
            # (`tiene_credito_de_reserva`) para no duplicar lo que el cobro
            # online ya había asentado. Eso se terminó: **todo cobro anterior al
            # check-out asienta su propio crédito `anticipo` en el momento en
            # que entra la plata** — `registrar_cobro` para el mostrador y la
            # transferencia, `PagoWebService._acreditar` para Mercado Pago.
            #
            # Acá no entra plata nueva. Lo que pasa es que el anticipo encuentra
            # su contrapartida: se marca aplicado contra el débito del alquiler
            # y deja de contarse en "anticipos por aplicar".
            #
            # `debito_alquiler` puede ser `None` —el auto salió sin precio
            # cargado— y se marca igual: el anticipo se consumió, y contra qué
            # es información extra, no la condición. Sin esto quedaría "por
            # aplicar" para siempre y la deuda saldría inflada por el anticipo
            # entero (`PLAN_DINERO.md` §4.2, borde a).
            #
            # El crédito del **echeq** no se toca: tiene naturaleza
            # `echeq_en_cartera`, no `anticipo`. Es un papel, no plata.
            self.cc_service.aplicar_anticipos_de_reserva(
                reserva.id, debito_alquiler.id if debito_alquiler else None
            )

            # Y los pagos de la seña, que nacieron sin alquiler porque el
            # alquiler no existía, encuentran el suyo.
            self._completar_pagos_de_la_reserva(reserva.id, alquiler.id)

            # La garantía en plata entra a la caja de hoy. Nunca al ledger (D-27).
            self._registrar_garantia_recibida(alquiler, reserva, checkout_fecha, usuario_id)

            # Si se pasó un pago inmediato en el modal de checkout
            if pago_inmediato and pago_inmediato.monto > 0:
                pago_checkout = Pago(
                    alquiler_id=alquiler.id,
                    cliente_id=reserva.cliente_id,
                    monto=pago_inmediato.monto,
                    medio_pago=pago_inmediato.medio_pago,
                    con_factura=False,
                    fecha=pago_inmediato.fecha,
                    notas=pago_inmediato.notas or f"Pago en checkout",
                    cobrado_por=usuario_id,
                )
                self.db.add(pago_checkout)
                self.db.flush()
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="credito",
                    naturaleza="pago",
                    concepto=f"Cobro en checkout — alquiler #{reserva.id} ({pago_checkout.medio_pago})",
                    monto=pago_inmediato.monto,
                    fecha=pago_inmediato.fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler.id,
                    reserva_id=reserva.id,
                    pago_id=pago_checkout.id,
                )

            # Cambiar estado de la reserva
            self.reserva_repo.update(reserva, estado=EstadoReserva.ACTIVA.value)

            # Cambiar estado del vehículo (idempotente si ya estaba alquilado)
            vehiculo = reserva.vehiculo
            estado_actual = EstadoVehiculo(vehiculo.estado)
            if estado_actual == EstadoVehiculo.ALQUILADO:
                nuevo_estado = EstadoVehiculo.ALQUILADO
            else:
                nuevo_estado = estado_tras_checkout(estado_actual)
            vehiculo.estado = nuevo_estado.value
            vehiculo.km_actual = checkout_km

        self.db.refresh(alquiler)
        logger.info(
            "checkout",
            extra={"alquiler_id": alquiler.id, "reserva_id": reserva_id, "usuario_id": usuario_id},
        )
        return alquiler, warnings

    # ── Checkin ───────────────────────────────────────────────────────────────

    def checkin(
        self,
        alquiler_id: int,
        checkin_fecha: date,
        checkin_hora: time,
        checkin_km: int,
        checkin_combustible: int,
        checkin_descripcion: str | None,
        decision_excedente: DecisionExcedente,
        usuario_id: int,
        horas_a_cobrar: Decimal | None = None,
        monto_manual: Decimal | None = None,
        motivo_bonificacion: str | None = None,
        registrado_en_tiempo_real: bool = True,
        checkin_estado_limpieza: str | None = None,
        garantia_estado: str | None = None,
        garantia_monto_devuelto: Decimal | None = None,
        pago_inmediato: PagoInmediato | None = None,
        cargo_combustible: Decimal = Decimal("0"),
        cargo_limpieza: Decimal = Decimal("0"),
    ) -> Alquiler:
        """
        Registra el checkin con la decisión de cobro de excedente (D6 granular).
        Cambia estado: reserva → finalizada, vehículo → disponible o en_transicion.
        """
        alquiler = self.get(alquiler_id)
        reserva = alquiler.reserva

        # Acepta 'activa' (checkin dentro de término) y 'vencida' (devolución
        # tardía: la sincronización automática la pasó a vencida porque pasó
        # la hora de fin, pero el auto sigue sin volver). Ver
        # ReservaService.sincronizar_estados_por_horario.
        if reserva.estado not in (EstadoReserva.ACTIVA.value, EstadoReserva.VENCIDA.value):
            raise ConflictError(f"estado_invalido|La reserva no está activa ni vencida (estado: {reserva.estado})")

        checkin_dt = datetime.combine(checkin_fecha, checkin_hora)
        checkout_dt = datetime.combine(alquiler.checkout_fecha, alquiler.checkout_hora)

        # Validaciones
        if checkin_dt <= checkout_dt:
            raise BusinessRuleError(
                "checkin_antes_checkout",
                "El checkin debe ser posterior al checkout",
            )
        if checkin_km < alquiler.checkout_km:
            raise BusinessRuleError(
                "km_invalidos",
                f"El km de llegada ({checkin_km}) no puede ser menor al de salida ({alquiler.checkout_km})",
            )

        # Calcular excedente
        hora_devolucion = reserva.hora_devolucion_acordada or reserva.hora_inicio
        hora_devolucion_dt = datetime.combine(reserva.fecha_fin, hora_devolucion)
        tarifa_diaria = self._obtener_tarifa_diaria(reserva)
        resultado = calcular_excedente(hora_devolucion_dt, checkin_dt, tarifa_diaria, **self._params_excedente())

        # Aplicar decisión de cobro
        cargo_excedente, horas_cobradas, excedente_bonificado = self._aplicar_decision_excedente(
            decision=decision_excedente,
            resultado=resultado,
            horas_a_cobrar=horas_a_cobrar,
            monto_manual=monto_manual,
            tarifa_diaria=tarifa_diaria,
        )

        # Determinar nuevo estado del vehículo
        proxima = self.reserva_repo.find_proxima_confirmada(
            reserva.vehiculo_id, desde=checkin_dt, dentro_de_horas=4.0
        )
        proxima_en_horas = None
        if proxima:
            proxima_dt = datetime.combine(proxima.fecha_inicio, proxima.hora_inicio)
            proxima_en_horas = (proxima_dt - checkin_dt).total_seconds() / 3600

        nuevo_estado_vehiculo = estado_tras_checkin(
            EstadoVehiculo(reserva.vehiculo.estado),
            proxima_reserva_en_horas=proxima_en_horas,
        )

        with self.db.begin_nested():
            # Se valida y se registra **antes** de escribir el estado: si el
            # monto devuelto no cierra, el check-in entero se cae y no queda un
            # alquiler medio cerrado con una garantía mal anotada.
            garantia_monto_devuelto = self._resolver_garantia(
                alquiler, reserva, garantia_estado, garantia_monto_devuelto,
                checkin_fecha, usuario_id,
            )
            if garantia_estado and garantia_estado != alquiler.garantia_estado:
                alquiler.garantia_estado_en = datetime.utcnow()

            self.alquiler_repo.update(
                alquiler,
                checkin_fecha=checkin_fecha,
                checkin_hora=checkin_hora,
                checkin_km=checkin_km,
                checkin_combustible=checkin_combustible,
                checkin_descripcion=checkin_descripcion,
                checkin_registrado_en_tiempo_real=registrado_en_tiempo_real,
                checkin_estado_limpieza=checkin_estado_limpieza,
                garantia_estado=garantia_estado,
                garantia_monto_devuelto=garantia_monto_devuelto,
                horas_excedidas=Decimal(str(resultado.horas_excedidas)),
                horas_cobradas=horas_cobradas,
                cargo_excedente=cargo_excedente,
                excedente_bonificado=excedente_bonificado,
                decidido_por=usuario_id,
                motivo_bonificacion=motivo_bonificacion,
                cargo_combustible=cargo_combustible,
                cargo_limpieza=cargo_limpieza,
            )
            self.reserva_repo.update(reserva, estado=EstadoReserva.FINALIZADA.value)

            # Perdonar un excedente es regalar plata de la empresa, y es la
            # decisión más discrecional que toma alguien en el mostrador: el
            # sistema calcula el cargo y la persona decide no cobrarlo. Sin
            # esto, "¿por qué esta devolución con 6 horas de atraso salió $0?"
            # no tiene a quién preguntarle.
            if excedente_bonificado and resultado.cargo_sugerido > 0:
                auditoria_service.registrar(
                    self.db,
                    usuario_id=usuario_id,
                    accion="bonificar",
                    entidad_tipo="alquiler",
                    entidad_id=alquiler.id,
                    descripcion=(
                        f"Bonificó el excedente del alquiler #{alquiler.id} "
                        f"({resultado.horas_excedidas} h de atraso, "
                        f"${resultado.cargo_sugerido} sugeridos). "
                        f"Motivo: {motivo_bonificacion or 'sin motivo'}"
                    ),
                    datos_antes={
                        "cargo_calculado": resultado.cargo_sugerido,
                        "horas_excedidas": resultado.horas_excedidas,
                    },
                    datos_despues={
                        "cargo_cobrado": cargo_excedente,
                        "motivo": motivo_bonificacion,
                    },
                    monto=resultado.cargo_sugerido,
                )

            # Si la condición de pago cuenta los días desde el check-in, recién
            # ahora se puede calcular — el débito del checkout quedó sin
            # `fecha_vencimiento` a propósito (ver checkout()).
            # Vale también para contado: "se cobra al devolver el auto" es una
            # condición de pago legítima, y su vencimiento es el día del
            # check-in. Excluirlo dejaba ese débito sin fecha para siempre.
            if reserva.condicion_pago_ancla == "checkin":
                # Se buscan los débitos **con fecha provisoria**, no los que
                # están sin fecha: desde la Fase 5 nacen con una estimación, así
                # que "sin fecha" ya no encuentra nada. El auto volvió: ahora sí
                # se sabe contra qué contar el plazo.
                #
                # Los que alguien corrió a mano quedan afuera: `editar_vencimiento`
                # apaga `vencimiento_provisorio`, y una fecha renegociada con el
                # cliente no la puede pisar un automatismo.
                provisorios = (
                    self.db.query(MovimientoCuentaCorriente)
                    .filter(
                        MovimientoCuentaCorriente.reserva_id == reserva.id,
                        MovimientoCuentaCorriente.tipo == "debito",
                        MovimientoCuentaCorriente.anulado == False,
                        MovimientoCuentaCorriente.vencimiento_provisorio == True,
                    )
                    .all()
                )
                for debito in provisorios:
                    debito.fecha_vencimiento = calcular_vencimiento(
                        checkin_fecha, reserva.condicion_pago
                    )
                    debito.vencimiento_provisorio = False

            # Ledger completo: el excedente que efectivamente se decidió
            # cobrar (D-19) es un cargo adicional al alquiler — débito.
            # Si se bonificó (cargo_excedente == 0), no genera movimiento.
            if cargo_excedente and cargo_excedente > 0:
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    naturaleza="excedente",
                    concepto=f"Excedente alquiler #{reserva.id} — check-in ({decision_excedente.value})",
                    monto=cargo_excedente,
                    fecha=checkin_fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler_id,
                    reserva_id=reserva.id,
                )

            # Cargos de cierre (ítem 24): combustible faltante y limpieza,
            # ambos montos editables por el operador — un solo débito conjunto.
            cargos_cierre = (cargo_combustible or Decimal("0")) + (cargo_limpieza or Decimal("0"))
            if cargos_cierre > 0:
                partes = []
                if cargo_combustible and cargo_combustible > 0:
                    partes.append(f"combustible ${cargo_combustible}")
                if cargo_limpieza and cargo_limpieza > 0:
                    partes.append(f"limpieza ${cargo_limpieza}")
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    naturaleza="cargo_cierre",
                    concepto=f"Cargos de cierre alquiler #{reserva.id} — {', '.join(partes)}",
                    monto=cargos_cierre,
                    fecha=checkin_fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler_id,
                    reserva_id=reserva.id,
                )

            # Si el operario registró un cobro al momento del check-in
            if pago_inmediato and pago_inmediato.monto > 0:
                pago_checkin = Pago(
                    alquiler_id=alquiler_id,
                    cliente_id=reserva.cliente_id,
                    monto=pago_inmediato.monto,
                    medio_pago=pago_inmediato.medio_pago,
                    con_factura=False,
                    fecha=pago_inmediato.fecha,
                    notas=pago_inmediato.notas or f"Cobro en check-in #{alquiler_id}",
                    cobrado_por=usuario_id,
                )
                self.db.add(pago_checkin)
                self.db.flush()
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="credito",
                    naturaleza="pago",
                    concepto=f"Cobro en check-in — alquiler #{reserva.id} ({pago_checkin.medio_pago})",
                    monto=pago_inmediato.monto,
                    fecha=pago_inmediato.fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler_id,
                    reserva_id=reserva.id,
                    pago_id=pago_checkin.id,
                )

            vehiculo = reserva.vehiculo
            vehiculo.estado = nuevo_estado_vehiculo.value
            vehiculo.km_actual = checkin_km

        logger.info(
            "checkin",
            extra={
                "alquiler_id": alquiler_id,
                "decision_excedente": decision_excedente.value,
                "horas_excedidas": resultado.horas_excedidas,
                "horas_cobradas": float(horas_cobradas or 0),
                "cargo_excedente": float(cargo_excedente),
                "motivo": motivo_bonificacion,
                "usuario_id": usuario_id,
                "vehiculo_estado_post_checkin": nuevo_estado_vehiculo.value,
            },
        )

        self.db.refresh(alquiler)
        return alquiler

    # ── Extender alquiler (D11) ───────────────────────────────────────────────

    def extender(
        self,
        alquiler_id: int,
        nueva_fecha_fin: date,
        nueva_hora_fin: time,
        usuario_id: int,
        precio_manual: Decimal | None = None,
        pago_inmediato: PagoInmediato | None = None,
    ) -> Alquiler:
        """
        Extiende un alquiler activo a una nueva fecha de fin.

        Recalcula tarifa (puede cambiar de banda), salvo que venga un
        `precio_manual` — la extensión respeta entonces el precio pactado
        (puede tener descuento) en vez de forzar el de lista. Verifica
        solapamientos en el rango ampliado.

        **Y asienta la diferencia en la cuenta corriente**, que es lo que no
        hacía. `extender` pisaba `reserva.precio_total` y el débito del
        check-out se quedaba con el importe viejo: la deuda del cliente quedaba
        corta por la diferencia, para siempre, y el ledger se contradecía con la
        caja después de toda extensión (`PLAN_DINERO.md` §3.3b).

        **Un débito nuevo, no un contra-asiento más un débito completo**
        (decisión 5 del dueño). Reasentar todo perdería el historial de lo que
        se pactó primero, que es justamente lo que hace falta para explicar una
        factura discutida. El asiento nuevo dice sólo lo que cambió.

        El **cobro es opcional en el mismo acto**, igual que en el check-out y
        el check-in: por default el cliente paga la diferencia al devolver el
        auto, pero si la paga en el momento se registra acá y no hay que ir a
        Caja por separado.
        """
        alquiler = self.get(alquiler_id)
        reserva = alquiler.reserva

        # También se puede extender una reserva 'vencida': el cliente puede pedir
        # más tiempo después de la hora pactada, sin haber devuelto el auto todavía.
        if reserva.estado not in (EstadoReserva.ACTIVA.value, EstadoReserva.VENCIDA.value):
            raise ConflictError(f"estado_invalido|El alquiler debe estar activo o vencido para extenderse (estado: {reserva.estado})")

        nueva_fin_dt = datetime.combine(nueva_fecha_fin, nueva_hora_fin)
        fin_actual_dt = datetime.combine(reserva.fecha_fin, reserva.hora_fin)

        if nueva_fin_dt <= fin_actual_dt:
            raise BusinessRuleError(
                "fecha_invalida",
                "La nueva fecha de fin debe ser posterior a la actual",
            )

        # Verificar solapamientos en el rango ampliado (desde fin_actual hasta nueva_fin)
        ventanas = self._cargar_ventanas_raw(reserva.vehiculo_id, excluir_reserva_id=reserva.id)
        resultado_solape = detectar_solapamientos(
            reserva.vehiculo_id,
            fin_actual_dt,
            nueva_fin_dt,
            ventanas,
        )
        if resultado_solape.hay_conflicto_bloqueante:
            conflicto = resultado_solape.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento_extension|El vehículo tiene una reserva después de la fecha actual|"
                f"{conflicto.id}|{conflicto.cliente_nombre}|{conflicto.inicio.date()}|{conflicto.fin.date()}"
            )

        # Recalcular tarifa con la nueva duración
        nueva_duracion = calcular_duracion_dias(reserva.fecha_inicio, nueva_fecha_fin)
        tarifas_info, categoria_id = self._cargar_tarifas_info(reserva.vehiculo_id)

        fecha_fin_anterior = reserva.fecha_fin
        precio_anterior = reserva.precio_total
        tarifa_anterior_id = reserva.tarifa_aplicada_id

        tarifa_no_encontrada = False
        try:
            cot = cotizar_por_bandas(
                nueva_duracion, tarifas_info, categoria_id,
                canal_de_origen(reserva.origen),
            )
            nuevo_precio = cot.total
            nueva_tarifa_id = cot.tarifa_principal.id
        except BusinessRuleError:
            # Sin tarifa configurada para la nueva duración: se conserva el precio
            # y la tarifa anteriores en vez de anularlos (no se pierde la deuda).
            tarifa_no_encontrada = True
            nuevo_precio = precio_anterior
            nueva_tarifa_id = tarifa_anterior_id

        if precio_manual is not None:
            nuevo_precio = precio_manual

        # Si la reserva estaba 'vencida' y la nueva fecha/hora de fin queda en el
        # futuro, vuelve a 'activa' (ya no está fuera de término). Si la nueva
        # fecha sigue siendo pasada (caso raro), se mantiene 'vencida'.
        nuevo_estado = reserva.estado
        if reserva.estado == EstadoReserva.VENCIDA.value and nueva_fin_dt > datetime.now():
            nuevo_estado = EstadoReserva.ACTIVA.value

        with self.db.begin_nested():
            self.reserva_repo.update(
                reserva,
                fecha_fin=nueva_fecha_fin,
                hora_fin=nueva_hora_fin,
                tarifa_aplicada_id=nueva_tarifa_id,
                precio_total=nuevo_precio,
                estado=nuevo_estado,
            )

            # ── La diferencia, al libro ──────────────────────────────────────
            diferencia = Decimal(str(nuevo_precio or 0)) - Decimal(str(precio_anterior or 0))
            hoy = date.today()
            if diferencia > 0:
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    naturaleza="extension",
                    concepto=(
                        f"Extensión de alquiler #{reserva.id} — "
                        f"hasta {nueva_fecha_fin} ({fecha_fin_anterior} antes)"
                    ),
                    monto=diferencia,
                    fecha=hoy,
                    creado_por=usuario_id,
                    condicion=reserva.condicion_pago,
                    alquiler_id=alquiler.id,
                    reserva_id=reserva.id,
                )
            elif diferencia < 0:
                # Una extensión que baja el precio es rara pero posible: se
                # extiende y se pacta un precio manual más bajo. Se asienta el
                # crédito, con naturaleza `bonificacion` porque eso es —deuda
                # que se perdona—, y no se lo deja pasar en silencio.
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="credito",
                    naturaleza="bonificacion",
                    concepto=(
                        f"Extensión de alquiler #{reserva.id} — ajuste a la baja "
                        f"del precio pactado"
                    ),
                    monto=-diferencia,
                    fecha=hoy,
                    creado_por=usuario_id,
                    alquiler_id=alquiler.id,
                    reserva_id=reserva.id,
                )

            # El cobro, si el operador decidió cobrarla en el momento.
            if pago_inmediato and pago_inmediato.monto > 0:
                pago_extension = Pago(
                    alquiler_id=alquiler.id,
                    cliente_id=reserva.cliente_id,
                    reserva_id=reserva.id,
                    monto=pago_inmediato.monto,
                    medio_pago=pago_inmediato.medio_pago,
                    con_factura=False,
                    fecha=pago_inmediato.fecha,
                    notas=pago_inmediato.notas or f"Cobro de la extensión #{reserva.id}",
                    cobrado_por=usuario_id,
                )
                self.db.add(pago_extension)
                self.db.flush()
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="credito",
                    naturaleza="pago",
                    concepto=(
                        f"Cobro de la extensión — alquiler #{reserva.id} "
                        f"({pago_extension.medio_pago})"
                    ),
                    monto=pago_inmediato.monto,
                    fecha=pago_inmediato.fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler.id,
                    reserva_id=reserva.id,
                    pago_id=pago_extension.id,
                )
            # Si el auto se queda 3 días más, el seguro cubre esos 3 días más.
            # Sólo se mueve la cantidad de días: el precio unitario pactado no
            # se toca (ver ReservaService.recalcular_adicionales_por_duracion).
            if reserva.adicionales:
                # Import local: a nivel de módulo sería un ciclo.
                from app.services.reserva_service import ReservaService
                ReservaService(self.db).recalcular_adicionales_por_duracion(reserva)

        logger.info(
            "alquiler_extendido",
            extra={
                "alquiler_id": alquiler_id,
                "fecha_anterior": str(fecha_fin_anterior),
                "fecha_nueva": str(nueva_fecha_fin),
                "tarifa_anterior_id": tarifa_anterior_id,
                "tarifa_nueva_id": nueva_tarifa_id,
                "precio_anterior": float(precio_anterior or 0),
                "precio_nuevo": float(nuevo_precio or 0),
                "diferencia_asentada": float(diferencia),
                "cobrado_en_el_acto": float(pago_inmediato.monto) if pago_inmediato else 0.0,
                "tarifa_no_encontrada": tarifa_no_encontrada,
                "usuario_id": usuario_id,
            },
        )

        self.db.refresh(alquiler)
        return alquiler

    # ── Helpers privados ──────────────────────────────────────────────────────

    # ── Garantía ─────────────────────────────────────────────────────────────
    #
    # La garantía **nunca toca la cuenta corriente** (D-27): no es plata que el
    # cliente deba ni que se le deba, es plata que se retiene. Lo que sí hace es
    # entrar y salir de la **caja**, y sólo cuando es plata de verdad — una
    # garantía "tarjeta" es un número anotado en un papel, no fondos reservados
    # (ver `docs/ALTERNATIVAS_COBRO.md`), así que no mueve nada.

    # Los tipos de garantía que efectivamente mueven plata.
    GARANTIAS_QUE_SON_PLATA = ("efectivo", "transferencia")

    def _registrar_garantia_recibida(self, alquiler, reserva, fecha: date, usuario_id: int) -> None:
        """
        La garantía entra a la caja del día del check-out.

        Sin esto, una garantía de $300.000 en efectivo se guardaba en el cajón y
        el sistema no lo sabía: al cerrar el día ese efectivo estaba de más y
        nadie podía explicar por qué.
        """
        if alquiler.garantia_tipo not in self.GARANTIAS_QUE_SON_PLATA:
            return
        if not alquiler.garantia_monto or Decimal(str(alquiler.garantia_monto)) <= 0:
            return
        if alquiler.garantia_movimiento_caja_id is not None:
            return  # ya registrada

        from app.services.caja_service import CajaService

        mov = CajaService(self.db).registrar(
            tipo="garantia_recibida",
            monto=Decimal(str(alquiler.garantia_monto)),
            medio=alquiler.garantia_tipo,
            motivo=f"Garantía del alquiler #{alquiler.id} — reserva #{reserva.id}",
            fecha=fecha,
            creado_por=usuario_id,
            cliente_id=reserva.cliente_id,
            reserva_id=reserva.id,
            alquiler_id=alquiler.id,
        )
        alquiler.garantia_movimiento_caja_id = mov.id
        alquiler.garantia_estado_en = datetime.utcnow()

    def _resolver_garantia(
        self, alquiler, reserva, estado: str | None,
        monto_devuelto: Decimal | None, fecha: date, usuario_id: int,
    ) -> Decimal | None:
        """
        La garantía se devuelve (entera o en parte) en el check-in.

        Devuelve el monto efectivamente devuelto, ya validado. **Valida contra
        lo retenido**, que era lo que faltaba (`PLAN_DINERO.md` §1.5.d): nada
        impedía devolver más de lo que se había tomado, ni marcar `devuelta` con
        un monto parcial — dos formas de que la caja quedara mal sin que ningún
        error saltara.

        `devuelta` implica el monto entero aunque el payload no lo mande: el
        check-in del frontend sólo lo enviaba cuando el estado era
        `ejecutada_parcial`, y para el egreso de caja hace falta siempre.
        """
        if estado is None:
            return monto_devuelto

        retenido = Decimal(str(alquiler.garantia_monto or 0))

        if estado == "devuelta":
            # Si no vino el monto, es el total: "devuelta" quiere decir eso.
            devuelto = Decimal(str(monto_devuelto)) if monto_devuelto is not None else retenido
            if devuelto != retenido:
                raise BusinessRuleError(
                    "garantia_devuelta_parcial",
                    f"La garantía figura como devuelta entera pero el monto "
                    f"(${devuelto}) no coincide con lo retenido (${retenido}). "
                    f"Si se devolvió una parte, el estado es 'ejecutada_parcial'.",
                )
        elif estado == "ejecutada_total":
            devuelto = Decimal("0")
        elif estado == "ejecutada_parcial":
            devuelto = Decimal(str(monto_devuelto or 0))
            if devuelto <= 0:
                raise BusinessRuleError(
                    "garantia_parcial_sin_monto",
                    "Una ejecución parcial tiene que decir cuánto se le devolvió "
                    "al cliente. Si no se le devolvió nada, es 'ejecutada_total'.",
                )
            if devuelto >= retenido:
                raise BusinessRuleError(
                    "garantia_parcial_completa",
                    f"Se devolvieron ${devuelto} de ${retenido} retenidos: eso es "
                    f"la garantía entera, no una ejecución parcial.",
                )
        else:  # 'retenida'
            devuelto = Decimal(str(monto_devuelto)) if monto_devuelto is not None else None
            if devuelto:
                raise BusinessRuleError(
                    "garantia_retenida_con_devolucion",
                    "No se puede devolver plata de una garantía que sigue retenida.",
                )
            return devuelto

        if devuelto is not None and devuelto > retenido:
            raise BusinessRuleError(
                "garantia_devuelve_de_mas",
                f"No se pueden devolver ${devuelto} de una garantía de ${retenido}.",
            )

        # El egreso de caja, sólo por lo que efectivamente vuelve y sólo si la
        # garantía era plata. Lo que se ejecuta **no sale de la caja**: se queda,
        # y el daño que lo justifica se cobra por su propio camino (D-27,
        # patrón de tres pasos).
        if (
            alquiler.garantia_tipo in self.GARANTIAS_QUE_SON_PLATA
            and devuelto
            and devuelto > 0
        ):
            from app.services.caja_service import CajaService

            CajaService(self.db).registrar(
                tipo="garantia_devuelta",
                monto=devuelto,
                medio=alquiler.garantia_tipo,
                motivo=(
                    f"Garantía del alquiler #{alquiler.id} — "
                    + ("devuelta entera" if estado == "devuelta"
                       else f"devuelta en parte (se retienen ${retenido - devuelto})")
                ),
                fecha=fecha,
                creado_por=usuario_id,
                cliente_id=reserva.cliente_id,
                reserva_id=reserva.id,
                alquiler_id=alquiler.id,
            )

        return devuelto

    def _completar_pagos_de_la_reserva(self, reserva_id: int, alquiler_id: int) -> None:
        """
        Ata al alquiler recién creado los `Pago` que entraron antes de que
        existiera: la seña de mostrador, la transferencia, el cobro online.

        En la Fase 1 esto entraba sólo por `PagoWeb.pago_id`, porque era el
        único puente entre un cobro y su reserva. Con `Pago.reserva_id`
        (migración 079) alcanza con preguntar por la reserva, y el arreglo
        deja de estar limitado a Mercado Pago.

        Se sigue mirando `PagoWeb` además, para los cobros online que se
        acreditaron antes de esa migración y cuyo `Pago` quedó sin
        `reserva_id`.
        """
        from app.models.pago_web import PagoWeb

        pagos = list(
            self.db.query(Pago)
            .filter(Pago.reserva_id == reserva_id, Pago.alquiler_id.is_(None))
            .all()
        )
        ids = {p.id for p in pagos}
        for pw in (
            self.db.query(PagoWeb)
            .filter(PagoWeb.reserva_id == reserva_id, PagoWeb.pago_id.isnot(None))
            .all()
        ):
            if pw.pago_id not in ids:
                pago = self.db.get(Pago, pw.pago_id)
                if pago is not None:
                    pagos.append(pago)

        for pago in pagos:
            # Sólo si sigue suelto: si alguien ya lo ató a otro alquiler, ese
            # dato es de una persona y no se pisa.
            if pago.alquiler_id is None:
                pago.alquiler_id = alquiler_id


    def _aplicar_decision_excedente(
        self,
        decision: DecisionExcedente,
        resultado: ResultadoExcedente,
        horas_a_cobrar: Decimal | None,
        monto_manual: Decimal | None = None,
        tarifa_diaria: Decimal | None = None,
    ) -> tuple[Decimal, Decimal | None, bool]:
        """
        Calcula (cargo_excedente, horas_cobradas, excedente_bonificado)
        según la decisión del admin (D-19: el cargo sugerido es una
        sugerencia, no un automatismo — el operador decide qué se cobró).
        """
        if decision == DecisionExcedente.NO_COBRAR:
            return Decimal("0"), Decimal("0"), True

        if decision == DecisionExcedente.COBRAR_COMPLETO:
            return resultado.cargo_sugerido, Decimal(str(resultado.horas_excedidas)), False

        if decision == DecisionExcedente.UN_DIA_MAS:
            return (tarifa_diaria or Decimal("0")), None, False

        if decision == DecisionExcedente.MEDIO_DIA_MAS:
            return (tarifa_diaria or Decimal("0")) / 2, None, False

        if decision == DecisionExcedente.MONTO_MANUAL:
            if monto_manual is None or monto_manual <= 0:
                raise BusinessRuleError(
                    "monto_manual_invalido",
                    "Para monto manual se debe indicar un importe (> 0)",
                )
            return monto_manual, None, False

        # COBRAR_PARCIAL
        if horas_a_cobrar is None or horas_a_cobrar <= 0:
            raise BusinessRuleError(
                "cobro_parcial_invalido",
                "Para cobro parcial se debe indicar la cantidad de horas (> 0)",
            )
        if horas_a_cobrar > resultado.horas_excedidas:
            raise BusinessRuleError(
                "cobro_parcial_invalido",
                f"No se pueden cobrar más horas ({horas_a_cobrar}) que las excedidas ({resultado.horas_excedidas})",
            )
        cargo = horas_a_cobrar * resultado.tarifa_hora_excedente
        return cargo, horas_a_cobrar, False

    def _obtener_tarifa_diaria(self, reserva: Reserva) -> Decimal:
        """
        Precio **por día** del alquiler, que es la base del cargo por hora de
        excedente (`domain/control_24hs.py`).

        Desde D-35 no se puede leer `tarifa_aplicada.monto` directo: con el
        modelo de bloques, el `monto` de una tarifa semanal es el precio de la
        **semana**, así que usarlo acá cobraría el excedente a siete veces lo
        que corresponde.

        Se usa el precio efectivo por día —lo que el cliente realmente paga
        por día en este alquiler— porque es lo que preserva el comportamiento
        anterior y porque es el número que el cliente puede reconocer. Cobrar
        el excedente a la tarifa diaria suelta (más cara que la de un alquiler
        largo) sería defendible, pero es una decisión comercial que nadie tomó.
        """
        duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)

        # El precio pactado manda sobre cualquier recálculo: es el que el
        # cliente aceptó, e incluye el descuento que se le haya hecho.
        if reserva.precio_total and duracion > 0:
            return Decimal(str(reserva.precio_total)) / Decimal(duracion)

        tarifas_info, categoria_id = self._cargar_tarifas_info(reserva.vehiculo_id)
        try:
            cot = cotizar_por_bandas(
                duracion, tarifas_info, categoria_id, canal_de_origen(reserva.origen)
            )
            return cot.total / Decimal(duracion)
        except BusinessRuleError:
            raise BusinessRuleError(
                "tarifa_no_encontrada",
                "No hay tarifa configurada para calcular el excedente",
            )

    def _cargar_tarifas_info(self, vehiculo_id: int) -> tuple[list[TarifaInfo], int | None]:
        """Devuelve (tarifas, categoria_id_del_vehiculo) — ver mismo método en ReservaService."""
        from app.domain.enums import TipoTarifa
        vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id).first()
        categoria_id = vehiculo.categoria_id if vehiculo else None
        tarifas = (
            self.db.query(Tarifa)
            .filter(
                Tarifa.activo == True,
                (Tarifa.vehiculo_id == vehiculo_id) | (Tarifa.vehiculo_id.is_(None)),
            )
            .all()
        )
        tarifas_info = [
            TarifaInfo(
                id=t.id,
                tipo=TipoTarifa(t.tipo),
                monto=Decimal(str(t.monto)),
                vehiculo_id=t.vehiculo_id,
                categoria_id=t.categoria_id,
                # Ver el mismo comentario en `ReservaService._cargar_tarifas_info`:
                # sin el canal, una tarifa de un solo canal se cobra en los dos.
                canal=t.canal,
            )
            for t in tarifas
        ]
        return tarifas_info, categoria_id

    def _cargar_ventanas_raw(
        self, vehiculo_id: int, excluir_reserva_id: int | None = None
    ) -> list[VentanaReserva]:
        reservas = self.reserva_repo.list(vehiculo_id=vehiculo_id, page=1, page_size=9999)[0]
        ventanas = []
        for r in reservas:
            if excluir_reserva_id and r.id == excluir_reserva_id:
                continue
            if r.estado in ("confirmada", "activa", "vencida"):
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

    def _tiene_contrato_firmado(self, reserva_id: int) -> bool:
        """
        ¿Esta reserva tiene un contrato firmado?

        Pregunta por el **contrato**, no por el alquiler. Miraba
        `alquiler.contrato_firmado`, que en un check-out todavía no existe: el
        alquiler se crea unas líneas más abajo. Eso funcionaba de casualidad
        mientras el contrato sólo se podía emitir después de la entrega, pero
        ahora se emite al reservar — y con la versión vieja, un contrato
        firmado la semana pasada seguía pidiendo el "motivo por el que se
        entrega sin contrato".
        """
        from app.models.contrato import Contrato

        contrato = (
            self.db.query(Contrato)
            .filter(
                Contrato.reserva_id == reserva_id,
                Contrato.anulado.is_(False),
                Contrato.activo.is_(True),
            )
            .first()
        )
        return bool(contrato and contrato.firmado)
