"""
Repositorio de Alquileres.
Encapsula todas las queries a la tabla alquileres.
"""
from __future__ import annotations

from datetime import date
from sqlalchemy.orm import Session, joinedload

from app.models.alquiler import Alquiler
from app.models.reserva import Reserva


class AlquilerRepo:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Lectura básica ────────────────────────────────────────────────────────

    def get(self, id: int) -> Alquiler | None:
        return (
            self.db.query(Alquiler)
            .options(
                joinedload(Alquiler.reserva).joinedload(Reserva.vehiculo),
                joinedload(Alquiler.reserva).joinedload(Reserva.cliente),
            )
            .filter(Alquiler.id == id)
            .first()
        )

    def get_by_reserva(self, reserva_id: int) -> Alquiler | None:
        return (
            self.db.query(Alquiler)
            .filter(Alquiler.reserva_id == reserva_id)
            .first()
        )

    def list(
        self,
        vehiculo_id: int | None = None,
        cliente_id: int | None = None,
        con_checkin_pendiente: bool | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Alquiler], int]:
        q = (
            self.db.query(Alquiler)
            .options(
                joinedload(Alquiler.reserva).joinedload(Reserva.vehiculo),
                joinedload(Alquiler.reserva).joinedload(Reserva.cliente),
            )
            .join(Alquiler.reserva)
        )
        if vehiculo_id:
            q = q.filter(Reserva.vehiculo_id == vehiculo_id)
        if cliente_id:
            q = q.filter(Reserva.cliente_id == cliente_id)
        if con_checkin_pendiente is True:
            q = q.filter(Alquiler.checkin_fecha.is_(None))
        elif con_checkin_pendiente is False:
            q = q.filter(Alquiler.checkin_fecha.is_not(None))

        total = q.count()
        items = (
            q.order_by(Alquiler.checkout_fecha.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return items, total

    # ── Escritura ─────────────────────────────────────────────────────────────

    def create(self, alquiler: Alquiler) -> Alquiler:
        self.db.add(alquiler)
        self.db.flush()
        self.db.refresh(alquiler)
        return alquiler

    def update(self, alquiler: Alquiler, **kwargs) -> Alquiler:
        for field, value in kwargs.items():
            setattr(alquiler, field, value)
        self.db.flush()
        self.db.refresh(alquiler)
        return alquiler

    # ── Queries especiales ────────────────────────────────────────────────────

    def find_activos_para_vehiculo(self, vehiculo_id: int) -> list[Alquiler]:
        """Alquileres activos (post-checkout, pre-checkin) de un vehículo."""
        return (
            self.db.query(Alquiler)
            .join(Alquiler.reserva)
            .filter(
                Reserva.vehiculo_id == vehiculo_id,
                Alquiler.checkin_fecha.is_(None),
            )
            .all()
        )

    def find_para_ocupacion(
        self,
        fecha_inicio: date,
        fecha_fin: date,
        vehiculo_ids: list[int] | None = None,
    ) -> list[Alquiler]:
        """Alquileres en el rango de fechas para el calendario."""
        q = (
            self.db.query(Alquiler)
            .options(
                joinedload(Alquiler.reserva).joinedload(Reserva.vehiculo),
                joinedload(Alquiler.reserva).joinedload(Reserva.cliente),
            )
            .join(Alquiler.reserva)
            .filter(
                Alquiler.checkout_fecha < fecha_fin,
            )
        )
        if vehiculo_ids:
            q = q.filter(Reserva.vehiculo_id.in_(vehiculo_ids))
        return q.all()
