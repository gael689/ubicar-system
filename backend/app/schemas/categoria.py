from datetime import datetime
from pydantic import BaseModel


class CategoriaCreate(BaseModel):
    codigo: str
    nombre: str
    descripcion: str | None = None
    orden: int = 0


class CategoriaUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    orden: int | None = None


class CategoriaResponse(BaseModel):
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    orden: int
    activo: bool
    created_at: datetime

    model_config = {"from_attributes": True}
