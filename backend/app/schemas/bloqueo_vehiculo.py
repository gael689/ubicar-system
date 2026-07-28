"""Schemas de Bloqueos de vehículo (Fase 5, ítem 59 — plan §7.3)."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, model_validator


MotivoBloqueo = Literal["mantenimiento", "siniestro", "uso_interno", "venta", "otro"]


class _RangoValido(BaseModel):
    @model_validator(mode="after")
    def _fin_no_anterior_al_inicio(self):
        desde = getattr(self, "fecha_desde", None)
        hasta = getattr(self, "fecha_hasta", None)
        if desde and hasta and hasta < desde:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self


class BloqueoVehiculoCreate(_RangoValido):
    vehiculo_id: int
    fecha_desde: date
    fecha_hasta: date
    motivo: MotivoBloqueo = "mantenimiento"
    notas: str | None = None


class BloqueoVehiculoUpdate(_RangoValido):
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    motivo: MotivoBloqueo | None = None
    notas: str | None = None
    activo: bool | None = None


class BloqueoVehiculoResponse(BaseModel):
    id: int
    vehiculo_id: int
    fecha_desde: date
    fecha_hasta: date
    motivo: MotivoBloqueo
    notas: str | None
    activo: bool
    creado_por: int | None
    created_at: datetime
    dias: int
    vehiculo_patente: str | None = None
    model_config = {"from_attributes": True}


class ReservaEnConflicto(BaseModel):
    """Una reserva que choca con el bloqueo que se quiere crear."""
    id: int
    estado: str
    cliente: str
    fecha_inicio: date
    fecha_fin: date
