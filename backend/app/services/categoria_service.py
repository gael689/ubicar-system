from __future__ import annotations
"""
CategoriaService — CRUD de categorías de vehículo (D-08).
"""
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ConflictError
from app.models.categoria import Categoria
from app.repositories.categoria_repo import CategoriaRepository
from app.schemas.categoria import CategoriaCreate, CategoriaUpdate


class CategoriaService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = CategoriaRepository(db)

    def list(self, incluir_inactivas: bool = False) -> list[Categoria]:
        return self.repo.list_all(incluir_inactivas=incluir_inactivas)

    def get(self, id: int) -> Categoria:
        categoria = self.repo.get(id)
        if not categoria:
            raise NotFoundError("Categoría", id)
        return categoria

    def create(self, data: CategoriaCreate) -> Categoria:
        if self.repo.get_by_codigo(data.codigo):
            raise ConflictError(f"Ya existe una categoría con el código '{data.codigo}'")
        categoria = Categoria(**data.model_dump())
        self.db.add(categoria)
        self.db.commit()
        self.db.refresh(categoria)
        return categoria

    def update(self, id: int, data: CategoriaUpdate) -> Categoria:
        categoria = self.get(id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(categoria, field, value)
        self.db.commit()
        self.db.refresh(categoria)
        return categoria

    def deactivate(self, id: int) -> Categoria:
        """Baja lógica. NUNCA borra (ver regla-nunca-eliminar)."""
        categoria = self.get(id)
        categoria.activo = False
        self.db.commit()
        self.db.refresh(categoria)
        return categoria
