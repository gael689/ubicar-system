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
    categoria_id: int | None
    tipo: TipoTarifa
    monto: Decimal
    activo: bool
    vigencia_desde: date
    # Tarifa de relleno del sistema, no un precio decidido por nadie. La
    # pantalla la marca y la campana la sigue reclamando (migracion 058).
    es_generica: bool = False

    model_config = {"from_attributes": True}
