from datetime import datetime, date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, field_validator

TipoComprobante = Literal["factura_a", "factura_b", "factura_c", "nota_credito", "nota_debito", "remito"]
EstadoComprobante = Literal["emitida", "anulada", "cobrada"]


class ComprobanteCreate(BaseModel):
    tipo: TipoComprobante
    punto_venta: str | None = None
    numero: str
    fecha_emision: date
    fecha_vencimiento: date | None = None
    alquiler_id: int | None = None
    reserva_id: int | None = None
    neto: Decimal | None = None
    iva: Decimal | None = None
    total: Decimal

    @field_validator("total")
    @classmethod
    def _total_positivo(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("El total debe ser mayor a 0")
        return v


class AnularComprobanteRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El motivo de anulación es obligatorio")
        return v


class ClienteResumenComprobante(BaseModel):
    id: int
    nombre_completo: str
    dni_cuit: str
    model_config = {"from_attributes": True}


class ComprobanteResponse(BaseModel):
    id: int
    tipo: TipoComprobante
    punto_venta: str | None
    numero: str
    fecha_emision: date
    fecha_vencimiento: date | None
    cliente_id: int
    alquiler_id: int | None
    reserva_id: int | None
    neto: Decimal | None
    iva: Decimal | None
    total: Decimal
    cae: str | None
    cae_vencimiento: date | None
    archivo_key: str
    archivo_url: str | None = None
    estado: EstadoComprobante
    motivo_anulacion: str | None
    movimiento_cc_id: int | None
    activo: bool
    creado_por: int
    created_at: datetime
    cliente: ClienteResumenComprobante | None = None
    model_config = {"from_attributes": True}
