from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, field_validator

UrgenciaNotificacion = Literal["critica", "alta", "media", "baja"]
EstadoNotificacion = Literal["pendiente", "enviada", "leida", "pospuesta", "descartada", "resuelta"]


class NotificacionResponse(BaseModel):
    id: int
    tipo: str
    titulo: str
    descripcion: str
    urgencia: UrgenciaNotificacion
    entidad_tipo: str
    entidad_id: int
    url_destino: str
    fecha_objetivo: date | None
    programada_para: datetime
    estado: EstadoNotificacion
    posponer_hasta: datetime | None
    leida_at: datetime | None
    resuelta_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class NotificacionesListResponse(BaseModel):
    items: list[NotificacionResponse]
    total: int
    criticas: int
    urgentes: int


class PosponerNotificacionRequest(BaseModel):
    hasta: datetime


class GenerarNotificacionesResponse(BaseModel):
    creadas: int
    resueltas: int
    evaluadas: int


class PreferenciaNotificacionRequest(BaseModel):
    tipo_regla: str
    canales: list[Literal["in_app", "email", "push", "whatsapp"]] = ["in_app"]
    anticipacion_dias: int | None = None
    activo: bool = True

    @field_validator("tipo_regla")
    @classmethod
    def _tipo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("tipo_regla es obligatorio")
        return v


class PreferenciaNotificacionResponse(BaseModel):
    id: int
    usuario_id: int
    tipo_regla: str
    canales: list[str]
    anticipacion_dias: int | None
    activo: bool
    model_config = {"from_attributes": True}
