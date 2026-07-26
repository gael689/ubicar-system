from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


TipoTarifa = Literal["diaria", "semanal", "mensual"]


class TarifaCreate(BaseModel):
    tipo: TipoTarifa
    monto: Decimal = Field(..., gt=0)
    vigencia_desde: date | None = None


class TarifaUpdate(BaseModel):
    monto: Decimal | None = Field(None, gt=0)
    vigencia_desde: date | None = None


class TarifaResponse(BaseModel):
    id: int
    vehiculo_id: int | None
    tipo: TipoTarifa
    monto: Decimal
    activo: bool
    vigencia_desde: date

    model_config = {"from_attributes": True}
