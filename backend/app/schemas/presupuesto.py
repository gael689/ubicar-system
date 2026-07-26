from datetime import datetime
from pydantic import BaseModel
from typing import Literal


EstadoPresupuesto = Literal["borrador", "enviado", "aceptado", "vencido"]


class PresupuestoCreate(BaseModel):
    cliente_id: int | None = None
    vehiculo_id: int | None = None
    fecha_inicio: str
    fecha_fin: str
    tarifa_unitaria: float
    descuento: float = 0
    notas: str | None = None


class PresupuestoUpdate(BaseModel):
    estado: EstadoPresupuesto | None = None
    notas: str | None = None


class PresupuestoResponse(BaseModel):
    id: int
    cliente_id: int | None
    vehiculo_id: int | None
    fecha_inicio: str
    fecha_fin: str
    dias: int
    tarifa_unitaria: float
    descuento: float
    total: float
    estado: EstadoPresupuesto
    notas: str | None
    created_by: int
    created_at: datetime
    model_config = {"from_attributes": True}
