"""
Repositorio de Reservas.
Encapsula todas las queries a la tabla reservas.
"""
from __future__ import annotations

from datetime import datetime, date, time
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_

from app.models.reserva import Reserva
from app.models.alquiler import Alquiler
from app.domain.enums import EstadoReserva


class ReservaRepo:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Lectura básica ────────────────────────────────────────────────────────

    def get(self, id: int) -> Reserva | None:
        return (
            self.db.query(Reserva)
            .options(
                joinedload(Reserva.vehiculo),
                joinedload(Reserva.cliente),
                joinedload(Reserva.usuario),
            )
            .filter(Reserva.id == id)
            .first()
        )

    def list(
        self,
        estado: str | None = None,
        vehiculo_id: int | None = None,
        cliente_id: int | None = None,
        q: str | None = None,
        fecha: date | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Reserva], int]:
        from app.models.cliente import Cliente
        from app.models.vehiculo import Vehiculo

        query = self.db.query(Reserva).options(
            joinedload(Reserva.vehiculo),
            joinedload(Reserva.cliente),
        )
        if estado:
            query = query.filter(Reserva.estado == estado)
        if vehiculo_id:
            query = query.filter(Reserva.vehiculo_id == vehiculo_id)
        if cliente_id:
            query = query.filter(Reserva.cliente_id == cliente_id)
        if fecha:
            query = query.filter(Reserva.fecha_inicio <= fecha, Reserva.fecha_fin >= fecha)
        if q:
            term = f"%{q.strip()}%"
            query = (
                query
                .join(Reserva.cliente)
                .filter(
                    or_(
                        Cliente.nombre_completo.ilike(term),
                        Cliente.dni_cuit.ilike(term),
                    )
                )
            )
        total = query.count()
        items = (
            query.order_by(Reserva.fecha_inicio.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return items, total

    # ── Escritura ─────────────────────────────────────────────────────────────

    def create(self, reserva: Reserva) -> Reserva:
        self.db.add(reserva)
        self.db.flush()  # obtiene ID sin commit
        self.db.refresh(reserva)
        return reserva

    def update(self, reserva: Reserva, **kwargs) -> Reserva:
        for field, value in kwargs.items():
            setattr(reserva, field, value)
        self.db.flush()
        self.db.refresh(reserva)
        return reserva

    # ── Queries de solapamiento ───────────────────────────────────────────────

    def find_solapadas(
        self,
        vehiculo_id: int,
        inicio: datetime,
        fin: datetime,
        estados: list[str] | None = None,
        excluir_id: int | None = None,
    ) -> list[Reserva]:
        """
        Busca reservas que solapan con la ventana [inicio, fin).
        
        La condición de solapamiento es: inicio_reserva < fin AND fin_reserva > inicio.
        Ventanas adyacentes (fin_a == inicio_b) NO solapan.
        
        Args:
            estados: si se provee, filtra por esos estados. Default: confirmada + activa.
            excluir_id: ID a excluir (para edición de reservas existentes).
        """
        if estados is None:
            estados = [EstadoReserva.CONFIRMADA.value, EstadoReserva.ACTIVA.value]

        # Construimos el datetime combinando fecha + hora para comparar
        q = (
            self.db.query(Reserva)
            .filter(
                Reserva.vehiculo_id == vehiculo_id,
                Reserva.estado.in_(estados),
                # inicio_reserva < fin (propuesta)  AND  fin_reserva > inicio (propuesta)
                # Usamos la representación como datetime para comparar correctamente
                and_(
                    # fecha_inicio + hora_inicio < fin (propuesta)
                    Reserva.fecha_inicio < fin.date(),
                    # fecha_fin + hora_fin > inicio (propuesta)
                    Reserva.fecha_fin > inicio.date(),
                ),
            )
        )
        if excluir_id is not None:
            q = q.filter(Reserva.id != excluir_id)

        return q.all()

    def find_proxima_confirmada(
        self,
        vehiculo_id: int,
        desde: datetime,
        dentro_de_horas: float = 4.0,
    ) -> Reserva | None:
        """
        Busca la próxima reserva confirmada del vehículo que empieza
        dentro de las próximas N horas desde `desde`.
        Usado por el checkin para determinar si el vehículo va a en_transicion.
        """
        from datetime import timedelta
        hasta = desde + timedelta(hours=dentro_de_horas)
        return (
            self.db.query(Reserva)
            .filter(
                Reserva.vehiculo_id == vehiculo_id,
                Reserva.estado == EstadoReserva.CONFIRMADA.value,
                Reserva.fecha_inicio >= desde.date(),
                Reserva.fecha_inicio < hasta.date(),
            )
            .order_by(Reserva.fecha_inicio)
            .first()
        )

    def count_confirmadas_activas(
        self,
        vehiculo_id: int,
        excluir_id: int | None = None,
    ) -> int:
        """
        Cuenta las reservas confirmadas o activas del vehículo.
        Usado para decidir si el vehículo vuelve a disponible al cancelar.
        """
        q = self.db.query(Reserva).filter(
            Reserva.vehiculo_id == vehiculo_id,
            Reserva.estado.in_([EstadoReserva.CONFIRMADA.value, EstadoReserva.ACTIVA.value]),
        )
        if excluir_id is not None:
            q = q.filter(Reserva.id != excluir_id)
        return q.count()

    def find_activas_para_vehiculo(self, vehiculo_id: int) -> list[Reserva]:
        """
        Reservas pendientes, confirmadas y activas de un vehículo.
        Usado en D4 (inactivación de vehículo).
        """
        return (
            self.db.query(Reserva)
            .options(joinedload(Reserva.cliente))
            .filter(
                Reserva.vehiculo_id == vehiculo_id,
                Reserva.estado.in_([
                    EstadoReserva.PENDIENTE.value,
                    EstadoReserva.CONFIRMADA.value,
                    EstadoReserva.ACTIVA.value,
                ]),
            )
            .order_by(Reserva.fecha_inicio)
            .all()
        )

    def find_a_reasignar(self) -> list[Reserva]:
        """
        Reservas de vehículos inactivos que deben reasignarse.
        Vista D4 "Reservas a reasignar".
        """
        from app.models.vehiculo import Vehiculo
        return (
            self.db.query(Reserva)
            .join(Reserva.vehiculo)
            .options(
                joinedload(Reserva.vehiculo),
                joinedload(Reserva.cliente),
            )
            .filter(
                Vehiculo.activo == False,
                Reserva.estado.in_([
                    EstadoReserva.PENDIENTE.value,
                    EstadoReserva.CONFIRMADA.value,
                    EstadoReserva.ACTIVA.value,
                ]),
            )
            .all()
        )

    def find_para_ocupacion(
        self,
        fecha_inicio: date,
        fecha_fin: date,
        vehiculo_ids: list[int] | None = None,
    ) -> list[Reserva]:
        """Query optimizada para el endpoint /ocupacion (calendario)."""
        q = (
            self.db.query(Reserva)
            .options(
                joinedload(Reserva.vehiculo),
                joinedload(Reserva.cliente),
                joinedload(Reserva.alquiler),
            )
            .filter(
                Reserva.fecha_inicio < fecha_fin,
                Reserva.fecha_fin > fecha_inicio,
                Reserva.estado.in_([
                    EstadoReserva.PENDIENTE.value,
                    EstadoReserva.CONFIRMADA.value,
                    EstadoReserva.ACTIVA.value,
                    EstadoReserva.FINALIZADA.value,
                ]),
            )
        )
        if vehiculo_ids:
            q = q.filter(Reserva.vehiculo_id.in_(vehiculo_ids))
        return q.all()
