from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CategoriaCreate(BaseModel):
    codigo: str
    nombre: str
    descripcion: str | None = None
    orden: int = 0
    franquicia_base: Decimal | None = Field(default=None, ge=0)


class CategoriaUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    orden: int | None = None
    franquicia_base: Decimal | None = Field(default=None, ge=0)


class CategoriaResponse(BaseModel):
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    orden: int
    activo: bool
    created_at: datetime

    # ── Franquicia (Fase 5 de la reestructuración) ───────────────────────────
    # **La columna existe desde la migración 064 y no estaba en ningún schema**,
    # así que no había forma de leerla ni de escribirla por la API: cambiar una
    # franquicia exigía escribir una migración. Y mientras tanto el sitio
    # público sí se la mostraba al cliente (`/public/disponibilidad` la emite
    # aparte), o sea que el dato existía para el cliente y no para quien
    # atiende el mostrador.
    #
    # `None` significa "todavía sin cargar", y es distinto de cero: el PDF del
    # contrato **omite la línea entera** cuando es `None`, porque un
    # "franquicia $0" se lee como "no pagás nada", que es lo contrario de la
    # verdad. La notificación `categoria_sin_franquicia` es la que reclama
    # cargarla.
    # Sale como número y no como `Decimal`, que Pydantic serializaría a string:
    # es la misma forma en que ya la emite `/public/disponibilidad`
    # (`disponibilidad_service.py` la castea a `float`), así que la web y el
    # sistema interno reciben el mismo tipo y el frontend no tiene que adivinar.
    franquicia_base: float | None = None

    model_config = {"from_attributes": True}
