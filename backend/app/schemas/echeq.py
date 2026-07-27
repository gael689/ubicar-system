from datetime import date, datetime
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
    cliente_id: int | None = None
    proveedor_nombre: str | None = None
    reserva_id: int | None = None
    alquiler_id: int | None = None
    gasto_id: int | None = None
    notas: str | None = None


class EcheqUpdate(BaseModel):
    estado: EstadoEcheq | None = None
    notas: str | None = None
    banco: str | None = None
    numero_cheque: str | None = None
    fecha_cobro: date | None = None
    fecha_acreditacion: date | None = None
    motivo_rechazo: str | None = None


class EcheqResponse(BaseModel):
    id: int
    tipo: TipoEcheq
    monto: float
    fecha_emision: date
    fecha_cobro: date | None
    fecha_acreditacion: date | None
    estado: EstadoEcheq
    contraparte: str
    banco: str | None
    numero_cheque: str | None
    cliente_id: int | None
    proveedor_nombre: str | None
    motivo_rechazo: str | None
    reserva_id: int | None
    alquiler_id: int | None
    gasto_id: int | None
    cuenta_corriente_id: int | None
    movimiento_cc_id: int | None
    notas: str | None
    activo: bool
    creado_por: int | None
    created_at: datetime
    cliente_nombre: str | None = None
    # Calculado: True si falta banco, número o fecha de cobro — para el
    # badge "Pendiente de completar" en el frontend, sin agregar una columna
    # de estado nueva.
    datos_completos: bool = True
    model_config = {"from_attributes": True}
