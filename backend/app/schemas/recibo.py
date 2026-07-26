from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, field_validator

MedioPagoRecibo = Literal["efectivo", "transferencia", "tarjeta", "cheque", "echeq"]


class ReciboCreate(BaseModel):
    cliente_id: int
    fecha: date
    monto: Decimal
    medio_pago: MedioPagoRecibo
    concepto: str = "Pago a cuenta"

    @field_validator("monto")
    @classmethod
    def _monto_positivo(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return v


class AnularReciboRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El motivo de anulación es obligatorio")
        return v


class ClienteResumenRecibo(BaseModel):
    id: int
    nombre_completo: str
    dni_cuit: str
    model_config = {"from_attributes": True}


class ReciboResponse(BaseModel):
    id: int
    numero: int
    prefijo: str
    cliente_id: int
    cuenta_corriente_id: int
    movimiento_cc_id: int
    fecha: date
    monto: Decimal
    medio_pago: str
    concepto: str
    saldo_anterior: Decimal
    saldo_posterior: Decimal
    estado: str
    motivo_anulacion: str | None = None
    anulado_por: int | None = None
    anulado_en: datetime | None = None
    archivo_key: str | None = None
    creado_por: int
    created_at: datetime
    cliente: ClienteResumenRecibo | None = None
    model_config = {"from_attributes": True}
