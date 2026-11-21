from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, model_validator

from app.domain.avisos_catalogo import accion_de, etiqueta_de, modulo_de

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
    # Datos estructurados del aviso (impacto, WhatsApp…). Sólo los traen las
    # oportunidades; en los avisos comunes es `None`.
    datos: dict | None = None
    # Calculados desde `domain/avisos_catalogo.py`, sin columna: mover un tipo
    # de módulo no necesita migración y vale también para el historial viejo.
    modulo: str = ""
    modulo_label: str = ""
    accion: str = ""
    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _completar_desde_el_catalogo(self):
        self.modulo = modulo_de(self.tipo)
        self.modulo_label = etiqueta_de(self.modulo)
        # Una regla puede afinar el texto del botón según el caso (la demanda
        # sin cupo manda a la bandeja o a las reglas de venta, según el motivo).
        propia = (self.datos or {}).get("accion")
        self.accion = propia if isinstance(propia, str) and propia else accion_de(self.tipo)
        return self


class ResumenModulo(BaseModel):
    modulo: str
    label: str
    total: int
    urgentes: int


class NotificacionesListResponse(BaseModel):
    items: list[NotificacionResponse]
    total: int
    criticas: int
    urgentes: int
    # Sólo los módulos con algo, en el orden del catálogo. Se cuenta sobre todo
    # lo activo (sin el filtro `modulo`), para que los contadores de las
    # pestañas no cambien al entrar a una.
    por_modulo: list[ResumenModulo] = []


class LeerTodasRequest(BaseModel):
    modulo: str | None = None


class OportunidadesListResponse(BaseModel):
    items: list[NotificacionResponse]
    total: int
    # Suma de los impactos estimados de las que traen uno.
    impacto_total: float


class PosponerNotificacionRequest(BaseModel):
    hasta: datetime


class GenerarNotificacionesResponse(BaseModel):
    creadas: int
    resueltas: int
    evaluadas: int
