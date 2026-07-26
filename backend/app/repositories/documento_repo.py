"""Repositorio de Documentos."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.documento import Documento
from app.repositories.base import BaseRepository


class DocumentoRepository(BaseRepository[Documento]):
    def __init__(self, db: Session):
        super().__init__(Documento, db)

    def list_by_vehiculo(self, vehiculo_id: int, tipo: str | None = None) -> list[Documento]:
        stmt = select(Documento).where(Documento.vehiculo_id == vehiculo_id)
        if tipo:
            stmt = stmt.where(Documento.tipo == tipo)
        stmt = stmt.order_by(Documento.fecha_carga.desc())
        return list(self.db.execute(stmt).scalars().all())

    def list_by_cliente(self, cliente_id: int, tipo: str | None = None) -> list[Documento]:
        stmt = select(Documento).where(Documento.cliente_id == cliente_id)
        if tipo:
            stmt = stmt.where(Documento.tipo == tipo)
        stmt = stmt.order_by(Documento.fecha_carga.desc())
        return list(self.db.execute(stmt).scalars().all())
