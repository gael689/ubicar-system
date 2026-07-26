from __future__ import annotations
"""
ReservaService — orquesta la lógica de negocio de reservas.
Capa transaccional: cruza vehículo, cliente, reserva dentro de transacciones explícitas.
"""
from datetime import datetime, date, time
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ConflictError, BusinessRuleError
from app.domain.enums import EstadoReserva, EstadoVehiculo
from app.domain.solapamientos import detectar_solapamientos
from app.domain.tarifas import seleccionar_tarifa, calcular_duracion_dias, calcular_precio_total, TarifaInfo
from app.domain.transiciones import (
    estado_tras_confirmar_reserva,
    estado_tras_cancelar_reserva_confirmada,
)
from app.domain.ventana import VentanaReserva
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.models.cliente import Cliente
from app.models.tarifa import Tarifa
from app.repositories.reserva_repo import ReservaRepo
from app.repositories.alquiler_repo import AlquilerRepo


class ReservaService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.reserva_repo = ReservaRepo(db)
        self.alquiler_repo = AlquilerRepo(db)

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

    def create(
        self,
        vehiculo_id: int,
        cliente_id: int,
        fecha_inicio: date,
        hora_inicio: time,
        fecha_fin: date,
        hora_fin: time,
        lugar_entrega: str,
        lugar_devolucion: str,
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
        anticipo_fecha: str | None = None,
        anticipo_medio_pago: str | None = None,
        usuario_id: int = 0,
    ) -> tuple[Reserva, list[dict]]:
        """
        Crea una reserva en estado 'pendiente'.

        Returns:
            (reserva, warnings) — warnings son solapamientos con pendientes.

        Raises:
            NotFoundError: vehículo o cliente no existe o está inactivo.
            ConflictError: solapamiento contra reserva confirmada o alquiler activo.
        """
        # 1. Verificar que vehículo y cliente existen y están activos
        vehiculo = self.db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id).first()
        if not vehiculo or not vehiculo.activo:
            raise NotFoundError("Vehículo", vehiculo_id)

        cliente = self.db.query(Cliente).filter(Cliente.id == cliente_id).first()
        if not cliente or not cliente.activo:
            raise NotFoundError("Cliente", cliente_id)

        # 2. Construir datetime completos para solapamiento
        inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
        fin_dt = datetime.combine(fecha_fin, hora_fin)

        if inicio_dt >= fin_dt:
            raise BusinessRuleError("fechas_invalidas", "La fecha de fin debe ser posterior a la de inicio")

        # 3. Detectar solapamientos
        ventanas = self._cargar_ventanas(vehiculo_id)
        resultado = detectar_solapamientos(vehiculo_id, inicio_dt, fin_dt, ventanas)

        if resultado.hay_conflicto_bloqueante:
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|El vehículo tiene una reserva {conflicto.estado} en ese rango|"
                f"{conflicto.id}|{conflicto.estado}|{conflicto.inicio.date()}|{conflicto.fin.date()}"
            )

        # 4. Construir warnings por solapamiento con pendientes
        warnings = [
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

        # Calcular tarifa y precio si no viene manual
        tarifa_id = None
        if precio_total is None:
            duracion = calcular_duracion_dias(fecha_inicio, fecha_fin)
            tarifas_info = self._cargar_tarifas_info(vehiculo_id)
            try:
                tarifa = seleccionar_tarifa(duracion, tarifas_info)
                precio_total = calcular_precio_total(duracion, tarifa)
                tarifa_id = tarifa.id
            except BusinessRuleError:
                pass

        # 6. Crear reserva (ya CONFIRMADA directamente)
        with self.db.begin_nested():
            reserva = Reserva(
                vehiculo_id=vehiculo_id,
                cliente_id=cliente_id,
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
            
            # Actualizar estado del vehículo a reservado si corresponde
            nuevo_estado = estado_tras_confirmar_reserva(
                EstadoVehiculo(vehiculo.estado)
            )
            if nuevo_estado.value != vehiculo.estado:
                vehiculo.estado = nuevo_estado.value

        self.db.refresh(reserva)
        return reserva, warnings

    # ── Actualizar reserva (solo pendiente) ───────────────────────────────────

    def update(
        self,
        id: int,
        usuario_id: int,
        vehiculo_id: int | None = None,
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
        anticipo_fecha: str | None = None,
        anticipo_medio_pago: str | None = None,
    ) -> tuple[Reserva, list[dict]]:
        """Actualiza una reserva en estado pendiente o confirmada (D8)."""
        reserva = self.get(id)

        if reserva.estado not in (EstadoReserva.PENDIENTE.value, EstadoReserva.CONFIRMADA.value):
            raise ConflictError(f"estado_invalido|No se puede modificar una reserva en estado '{reserva.estado}'")

        # Si es confirmada, no se puede cambiar cliente
        # (vehiculo_id y fechas sí, según D8)

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
            conflicto = resultado.conflictos_bloqueantes[0]
            raise ConflictError(
                f"solapamiento|Conflicto en el nuevo rango|{conflicto.id}|{conflicto.estado}"
            )

        warnings = [
            {"tipo": "solape_con_pendiente", "reserva_id": v.id}
            for v in resultado.conflictos_advertencia
        ]

        with self.db.begin_nested():
            kwargs = {}
            if vehiculo_id is not None:
                kwargs["vehiculo_id"] = vehiculo_id
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

        self.db.refresh(reserva)
        return reserva, warnings

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
            tarifas_info = self._cargar_tarifas_info(reserva.vehiculo_id)
            try:
                tarifa = seleccionar_tarifa(duracion, tarifas_info)
                precio = calcular_precio_total(duracion, tarifa)
                tarifa_id = tarifa.id
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

    def cancelar(self, id: int, usuario_id: int) -> Reserva:
        """Cancela una reserva pendiente o confirmada."""
        reserva = self.get(id)
        if reserva.estado not in (EstadoReserva.PENDIENTE.value, EstadoReserva.CONFIRMADA.value):
            raise ConflictError(f"estado_invalido|No se puede cancelar una reserva en estado '{reserva.estado}'")

        era_confirmada = reserva.estado == EstadoReserva.CONFIRMADA.value

        with self.db.begin_nested():
            self.reserva_repo.update(reserva, estado=EstadoReserva.CANCELADA.value)

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

        self.db.refresh(reserva)
        return reserva

    # ── Inactivación de vehículo con reservas (D4) ────────────────────────────

    def get_reservas_afectadas_por_inactivacion(self, vehiculo_id: int) -> list[Reserva]:
        """Dry-run: lista reservas que se verían afectadas por inactivar el vehículo."""
        return self.reserva_repo.find_activas_para_vehiculo(vehiculo_id)

    def reasignar(self, reserva_id: int, nuevo_vehiculo_id: int, usuario_id: int) -> tuple[Reserva, list[dict]]:
        """
        Reasigna una reserva a otro vehículo (D4).
        Solo para reservas pendientes o confirmadas.
        Re-verifica solapamientos en el vehículo destino.
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

        with self.db.begin_nested():
            self.reserva_repo.update(reserva, vehiculo_id=nuevo_vehiculo_id)

        self.db.refresh(reserva)
        return reserva, warnings

    def get_reservas_a_reasignar(self) -> list[Reserva]:
        """Vista D4: reservas de vehículos inactivos que necesitan reasignación."""
        return self.reserva_repo.find_a_reasignar()

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _cargar_ventanas(self, vehiculo_id: int) -> list[VentanaReserva]:
        """Carga ventanas de reservas existentes para el vehículo."""
        reservas = self.reserva_repo.list(vehiculo_id=vehiculo_id, page=1, page_size=9999)[0]
        ventanas = []
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

    def _cargar_tarifas_info(self, vehiculo_id: int) -> list[TarifaInfo]:
        """Carga las tarifas activas relevantes para el vehículo."""
        tarifas = (
            self.db.query(Tarifa)
            .filter(
                Tarifa.activo == True,
                (Tarifa.vehiculo_id == vehiculo_id) | (Tarifa.vehiculo_id.is_(None)),
            )
            .all()
        )
        from app.domain.enums import TipoTarifa
        return [
            TarifaInfo(
                id=t.id,
                tipo=TipoTarifa(t.tipo),
                monto=Decimal(str(t.monto)),
                vehiculo_id=t.vehiculo_id,
            )
            for t in tarifas
        ]
