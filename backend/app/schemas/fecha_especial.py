"""Schemas de Fechas especiales (feriados, fechas comerciales, temporadas)."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator


TipoFechaEspecial = Literal["feriado", "fin_semana_largo", "comercial", "temporada", "otro"]
ColorFechaEspecial = Literal["rojo", "ambar", "verde", "azul", "violeta"]


class _RangoValido(BaseModel):
    @model_validator(mode="after")
    def _fin_no_anterior_al_inicio(self):
        desde = getattr(self, "fecha_desde", None)
        hasta = getattr(self, "fecha_hasta", None)
        if desde and hasta and hasta < desde:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self


class FechaEspecialCreate(_RangoValido):
    nombre: str
    fecha_desde: date
    fecha_hasta: date
    tipo: TipoFechaEspecial = "otro"
    color: ColorFechaEspecial = "ambar"
    notas: str | None = None

    @field_validator("nombre")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()


class FechaEspecialUpdate(_RangoValido):
    nombre: str | None = None
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    tipo: TipoFechaEspecial | None = None
    color: ColorFechaEspecial | None = None
    notas: str | None = None
    activo: bool | None = None


class FechaEspecialResponse(BaseModel):
    id: int
    nombre: str
    fecha_desde: date
    fecha_hasta: date
    tipo: TipoFechaEspecial
    color: ColorFechaEspecial
    notas: str | None
    activo: bool
    creado_por: int | None
    created_at: datetime
    model_config = {"from_attributes": True}
