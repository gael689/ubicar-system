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
from app.domain.control_24hs import calcular_excedente, ResultadoExcedente
from app.domain.enums import EstadoReserva, EstadoVehiculo, DecisionExcedente
from app.domain.solapamientos import detectar_solapamientos
from app.domain.tarifas import (
    seleccionar_tarifa, calcular_duracion_dias, calcular_precio_total, TarifaInfo
)
from app.domain.transiciones import estado_tras_checkout, estado_tras_checkin
from app.domain.ventana import VentanaReserva
from app.models.alquiler import Alquiler
from app.models.pago import Pago
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.models.tarifa import Tarifa
from app.repositories.alquiler_repo import AlquilerRepo
from app.repositories.reserva_repo import ReservaRepo
from app.schemas.alquiler import PagoInmediato
from app.services.cuenta_corriente_service import CuentaCorrienteService

logger = logging.getLogger(__name__)


class AlquilerService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.alquiler_repo = AlquilerRepo(db)
        self.reserva_repo = ReservaRepo(db)
        self.cc_service = CuentaCorrienteService(db)

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
        return calcular_excedente(hora_devolucion_dt, checkin_dt, tarifa_diaria)

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

        warnings = []
        if not reserva.alquiler or not (reserva.alquiler.contrato_firmado if reserva.alquiler else False):
            # Verificar si ya hay contrato firmado
            if not self._tiene_contrato_firmado(reserva_id):
                warnings.append({"tipo": "contrato_no_firmado", "mensaje": "El contrato aún no está firmado"})

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
                garantia_tipo=garantia_tipo,
                garantia_monto=garantia_monto,
                garantia_estado="retenida" if garantia_tipo and garantia_tipo != "no_aplica" else None,
                horas_excedidas=Decimal("0"),
                cargo_excedente=Decimal("0"),
                excedente_bonificado=False,
                decidido_por=usuario_id,
            )
            self.alquiler_repo.create(alquiler)
            self.db.flush()  # Para obtener alquiler.id

            # Ledger completo: el checkout factura el alquiler completo como
            # un débito automático en la cuenta corriente del cliente,
            # exista o no un pago inmediato. Cualquier cobro (abajo) genera
            # el crédito que lo cancela — total o parcialmente.
            monto_facturado = (reserva.precio_total or Decimal("0")) + (reserva.cargo_late_checkout or Decimal("0"))
            if monto_facturado > 0:
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    concepto=f"Alquiler #{reserva.id} — checkout ({reserva.vehiculo.patente if reserva.vehiculo else ''})",
                    monto=monto_facturado,
                    fecha=checkout_fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler.id,
                    reserva_id=reserva.id,
                )

            # Si hay un anticipo guardado en la reserva, creamos el Pago ahora
            if reserva.anticipo_monto and reserva.anticipo_monto > 0:
                pago_anticipo = Pago(
                    alquiler_id=alquiler.id,
                    monto=reserva.anticipo_monto,
                    medio_pago=reserva.anticipo_medio_pago or "efectivo",
                    con_factura=False,
                    fecha=reserva.anticipo_fecha or checkout_fecha,
                    notas=f"Anticipo de reserva #{reserva.id}",
                    cobrado_por=usuario_id,
                )
                self.db.add(pago_anticipo)
                self.db.flush()
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="credito",
                    concepto=f"Anticipo de reserva #{reserva.id} ({pago_anticipo.medio_pago})",
                    monto=reserva.anticipo_monto,
                    fecha=pago_anticipo.fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler.id,
                    reserva_id=reserva.id,
                    pago_id=pago_anticipo.id,
                )

            # Si se pasó un pago inmediato en el modal de checkout
            if pago_inmediato and pago_inmediato.monto > 0:
                pago_checkout = Pago(
                    alquiler_id=alquiler.id,
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
        resultado = calcular_excedente(hora_devolucion_dt, checkin_dt, tarifa_diaria)

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
            )
            self.reserva_repo.update(reserva, estado=EstadoReserva.FINALIZADA.value)

            # Ledger completo: el excedente que efectivamente se decidió
            # cobrar (D-19) es un cargo adicional al alquiler — débito.
            # Si se bonificó (cargo_excedente == 0), no genera movimiento.
            if cargo_excedente and cargo_excedente > 0:
                self.cc_service.registrar_movimiento(
                    cliente_id=reserva.cliente_id,
                    tipo="debito",
                    concepto=f"Excedente alquiler #{reserva.id} — check-in ({decision_excedente.value})",
                    monto=cargo_excedente,
                    fecha=checkin_fecha,
                    creado_por=usuario_id,
                    alquiler_id=alquiler_id,
                    reserva_id=reserva.id,
                )

            # Si el operario registró un cobro al momento del check-in
            if pago_inmediato and pago_inmediato.monto > 0:
                pago_checkin = Pago(
                    alquiler_id=alquiler_id,
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
    ) -> Alquiler:
        """
        Extiende un alquiler activo a una nueva fecha de fin.
        Recalcula tarifa (puede cambiar de banda).
        Verifica solapamientos en el rango ampliado.
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
        tarifas_info = self._cargar_tarifas_info(reserva.vehiculo_id)

        fecha_fin_anterior = reserva.fecha_fin
        precio_anterior = reserva.precio_total
        tarifa_anterior_id = reserva.tarifa_aplicada_id

        tarifa_no_encontrada = False
        try:
            nueva_tarifa = seleccionar_tarifa(nueva_duracion, tarifas_info)
            nuevo_precio = calcular_precio_total(nueva_duracion, nueva_tarifa)
            nueva_tarifa_id = nueva_tarifa.id
        except BusinessRuleError:
            # Sin tarifa configurada para la nueva duración: se conserva el precio
            # y la tarifa anteriores en vez de anularlos (no se pierde la deuda).
            tarifa_no_encontrada = True
            nuevo_precio = precio_anterior
            nueva_tarifa_id = tarifa_anterior_id

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
                "tarifa_no_encontrada": tarifa_no_encontrada,
                "usuario_id": usuario_id,
            },
        )

        self.db.refresh(alquiler)
        return alquiler

    # ── Helpers privados ──────────────────────────────────────────────────────

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
        """Obtiene la tarifa diaria aplicada a la reserva."""
        if reserva.tarifa_aplicada_id:
            tarifa = self.db.query(Tarifa).filter(Tarifa.id == reserva.tarifa_aplicada_id).first()
            if tarifa:
                return Decimal(str(tarifa.monto))

        # Fallback: buscar tarifa diaria activa
        duracion = calcular_duracion_dias(reserva.fecha_inicio, reserva.fecha_fin)
        tarifas_info = self._cargar_tarifas_info(reserva.vehiculo_id)
        try:
            tarifa_sel = seleccionar_tarifa(duracion, tarifas_info)
            return tarifa_sel.monto
        except BusinessRuleError:
            raise BusinessRuleError(
                "tarifa_no_encontrada",
                "No hay tarifa configurada para calcular el excedente",
            )

    def _cargar_tarifas_info(self, vehiculo_id: int) -> list[TarifaInfo]:
        from app.domain.enums import TipoTarifa
        tarifas = (
            self.db.query(Tarifa)
            .filter(
                Tarifa.activo == True,
                (Tarifa.vehiculo_id == vehiculo_id) | (Tarifa.vehiculo_id.is_(None)),
            )
            .all()
        )
        return [
            TarifaInfo(
                id=t.id,
                tipo=TipoTarifa(t.tipo),
                monto=Decimal(str(t.monto)),
                vehiculo_id=t.vehiculo_id,
            )
            for t in tarifas
        ]

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
        from app.models.contrato import Contrato
        from app.models.alquiler import Alquiler as AlquilerModel
        alquiler = (
            self.db.query(AlquilerModel)
            .filter(AlquilerModel.reserva_id == reserva_id)
            .first()
        )
        if alquiler and alquiler.contrato_firmado:
            return True
        return False
