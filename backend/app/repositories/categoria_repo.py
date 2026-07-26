"""Repositorio de Categorías."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.categoria import Categoria
from app.repositories.base import BaseRepository


class CategoriaRepository(BaseRepository[Categoria]):
    def __init__(self, db: Session):
        super().__init__(Categoria, db)

    def list_all(self, incluir_inactivas: bool = False) -> list[Categoria]:
        stmt = select(Categoria)
        if not incluir_inactivas:
            stmt = stmt.where(Categoria.activo == True)
        stmt = stmt.order_by(Categoria.orden, Categoria.nombre)
        return list(self.db.execute(stmt).scalars().all())

    def get_by_codigo(self, codigo: str) -> Categoria | None:
        stmt = select(Categoria).where(Categoria.codigo == codigo)
        return self.db.execute(stmt).scalar_one_or_none()
