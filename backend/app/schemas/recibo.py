from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, field_validator

MedioPagoRecibo = Literal["efectivo", "transferencia", "tarjeta", "cheque", "echeq"]


class ReciboCreate(BaseModel):
    """Cobrar y documentar en una acción: genera el `Pago` y su recibo."""
    cliente_id: int
    fecha: date
    monto: Decimal
    medio_pago: MedioPagoRecibo
    concepto: str = "Pago a cuenta"
    # Opcional: si el cobro corresponde a un alquiler puntual, queda enlazado.
    # Sin él es un pago a cuenta contra el saldo general.
    alquiler_id: int | None = None

    @field_validator("monto")
    @classmethod
    def _monto_positivo(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return v


class ReciboDePagoRequest(BaseModel):
    """Emitir el recibo de un cobro que ya se registró. No mueve plata."""
    # Opcional a propósito: el recibo se emite de un click desde el listado de
    # cobros y ahí no hay dónde escribir un concepto. Si no viene, el router lo
    # arma con los datos del pago — que es lo que la persona escribiría igual.
    concepto: str | None = None


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
    pago_id: int | None = None
    movimiento_cc_id: int | None = None
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
