"""Repositorio de Comprobantes."""
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.comprobante import Comprobante
from app.repositories.base import BaseRepository


class ComprobanteRepository(BaseRepository[Comprobante]):
    def __init__(self, db: Session):
        super().__init__(Comprobante, db)

    def list_by_cliente(self, cliente_id: int, incluir_inactivos: bool = False) -> list[Comprobante]:
        stmt = select(Comprobante).options(joinedload(Comprobante.cliente)).where(Comprobante.cliente_id == cliente_id)
        if not incluir_inactivos:
            stmt = stmt.where(Comprobante.activo == True)
        stmt = stmt.order_by(Comprobante.fecha_emision.desc(), Comprobante.id.desc())
        return list(self.db.execute(stmt).unique().scalars().all())

    def get_with_cliente(self, id: int) -> Comprobante | None:
        stmt = select(Comprobante).options(joinedload(Comprobante.cliente)).where(Comprobante.id == id)
        return self.db.execute(stmt).unique().scalar_one_or_none()
