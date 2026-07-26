from datetime import date
from pydantic import BaseModel
from typing import Literal


TipoEcheq = Literal["emitido", "recibido"]
EstadoEcheq = Literal[
    "en_cartera", "depositado", "endosado",
    "cobrado", "rechazado", "vencido",
    "pendiente",  # legacy — no usar en registros nuevos
]


class EcheqCreate(BaseModel):
    tipo: TipoEcheq
    monto: float
    fecha_emision: date
    fecha_cobro: date
    contraparte: str
    banco: str
    numero_cheque: str
    alquiler_id: int | None = None
    gasto_id: int | None = None
    notas: str | None = None


class EcheqUpdate(BaseModel):
    estado: EstadoEcheq | None = None
    notas: str | None = None
    fecha_cobro: date | None = None


class EcheqResponse(EcheqCreate):
    id: int
    estado: EstadoEcheq
    model_config = {"from_attributes": True}
