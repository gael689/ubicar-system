from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator
from typing import Optional
from app.domain.enums import TipoServicio


class ServicioCreate(BaseModel):
    tipo: TipoServicio
    km_realizado: int
    fecha: date
    descripcion: Optional[str] = None
    costo: Optional[Decimal] = None
    proximo_km: Optional[int] = None
    proxima_fecha: Optional[date] = None

    @field_validator('km_realizado')
    @classmethod
    def km_positivo(cls, v: int) -> int:
        if v < 0:
            raise ValueError('km_realizado debe ser >= 0')
        return v


class ServicioUpdate(BaseModel):
    tipo: Optional[TipoServicio] = None
    km_realizado: Optional[int] = None
    fecha: Optional[date] = None
    descripcion: Optional[str] = None
    costo: Optional[Decimal] = None
    proximo_km: Optional[int] = None
    proxima_fecha: Optional[date] = None


class ServicioResponse(BaseModel):
    id: int
    vehiculo_id: int
    tipo: str
    km_realizado: int
    fecha: date
    descripcion: Optional[str]
    costo: Optional[Decimal]
    proximo_km: Optional[int]
    proxima_fecha: Optional[date]
    activo: bool
    created_at: datetime

    model_config = {"from_attributes": True}
