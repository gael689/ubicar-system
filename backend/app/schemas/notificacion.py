from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel

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
