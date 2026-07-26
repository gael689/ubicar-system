from pydantic import BaseModel
from typing import Literal


MedioPago = Literal["efectivo", "transferencia", "tarjeta", "cheque", "echeq", "cuenta_corriente"]


class PagoCreate(BaseModel):
    alquiler_id: int
    monto: float
    medio_pago: MedioPago
    con_factura: bool = False
    fecha: str
    notas: str | None = None


class PagoResponse(PagoCreate):
    id: int
    cobrado_por: int
    model_config = {"from_attributes": True}


class PagoDetalladoResponse(PagoResponse):
    cliente_nombre: str | None = None
    vehiculo_patente: str | None = None
    reserva_id: int | None = None


class PagoPendienteResponse(BaseModel):
    tipo: Literal["reserva", "alquiler_checkout"]
    id_origen: int
    cliente: str
    monto_total: float
    monto_abonado: float
    saldo_pendiente: float
    fecha_creacion: str
    notas: str | None = None
