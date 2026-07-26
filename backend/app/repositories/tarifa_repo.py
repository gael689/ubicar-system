"""Repositorio de Tarifas."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tarifa import Tarifa
from app.repositories.base import BaseRepository


class TarifaRepository(BaseRepository[Tarifa]):
    def __init__(self, db: Session):
        super().__init__(Tarifa, db)

    def list_by_vehiculo(self, vehiculo_id: int, incluir_inactivas: bool = False) -> list[Tarifa]:
        stmt = select(Tarifa).where(Tarifa.vehiculo_id == vehiculo_id)
        if not incluir_inactivas:
            stmt = stmt.where(Tarifa.activo == True)
        stmt = stmt.order_by(Tarifa.tipo, Tarifa.vigencia_desde.desc())
        return list(self.db.execute(stmt).scalars().all())

    def get_activa_por_tipo(self, vehiculo_id: int, tipo: str) -> Tarifa | None:
        stmt = select(Tarifa).where(
            Tarifa.vehiculo_id == vehiculo_id,
            Tarifa.tipo == tipo,
            Tarifa.activo == True,
        )
        return self.db.execute(stmt).scalar_one_or_none()
