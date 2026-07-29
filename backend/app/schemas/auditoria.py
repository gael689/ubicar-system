from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditoriaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_id: int | None = None
    usuario_nombre: str | None = None
    accion: str
    entidad_tipo: str
    entidad_id: int | None = None
    descripcion: str
    datos_antes: dict | None = None
    datos_despues: dict | None = None
    monto: float | None = None
    ip: str | None = None
    created_at: datetime


class OpcionesAuditoria(BaseModel):
    """
    Lo que hay cargado, para armar los filtros de la pantalla.

    Sale de la tabla y no de una lista fija en el frontend: si mañana se
    audita una entidad nueva, aparece en el filtro sin tocar la pantalla.
    """
    acciones: list[str]
    entidades: list[str]
    usuarios: list[dict]
