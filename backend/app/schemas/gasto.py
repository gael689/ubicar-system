from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


TipoGasto = Literal[
    "service", "combustible", "cubiertas", "reparacion",
    "seguro", "patente", "vtv", "lavado", "otro",
]
MedioPagoGasto = Literal["efectivo", "transferencia", "tarjeta", "cheque", "echeq"]


class GastoCreate(BaseModel):
    tipo: TipoGasto
    descripcion: str
    monto: Decimal = Field(..., gt=0)
    medio_pago: MedioPagoGasto
    fecha: date
    proveedor: str | None = None
    km_al_momento: int | None = Field(None, ge=0)
    notas: str | None = None


class GastoUpdate(BaseModel):
    tipo: TipoGasto | None = None
    descripcion: str | None = None
    monto: Decimal | None = Field(None, gt=0)
    medio_pago: MedioPagoGasto | None = None
    fecha: date | None = None
    proveedor: str | None = None
    km_al_momento: int | None = Field(None, ge=0)
    notas: str | None = None


class GastoResponse(BaseModel):
    id: int
    vehiculo_id: int
    tipo: TipoGasto
    descripcion: str
    monto: Decimal
    medio_pago: MedioPagoGasto
    fecha: date
    proveedor: str | None
    km_al_momento: int | None
    notas: str | None

    model_config = {"from_attributes": True}
