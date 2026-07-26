"""Repositorio de Gastos."""
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.gasto import Gasto
from app.repositories.base import BaseRepository


class GastoRepository(BaseRepository[Gasto]):
    def __init__(self, db: Session):
        super().__init__(Gasto, db)

    def list_by_vehiculo(
        self,
        vehiculo_id: int,
        *,
        tipo: str | None = None,
        fecha_desde: str | None = None,
        fecha_hasta: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[Gasto], int]:
        stmt = select(Gasto).where(Gasto.vehiculo_id == vehiculo_id)
        if tipo:
            stmt = stmt.where(Gasto.tipo == tipo)
        if fecha_desde:
            stmt = stmt.where(Gasto.fecha >= fecha_desde)
        if fecha_hasta:
            stmt = stmt.where(Gasto.fecha <= fecha_hasta)

        total = self.db.execute(
            select(func.count()).select_from(stmt.subquery())
        ).scalar_one()

        stmt = stmt.order_by(Gasto.fecha.desc(), Gasto.id.desc()).offset(skip).limit(limit)
        items = list(self.db.execute(stmt).scalars().all())
        return items, total
