from datetime import date
from pydantic import BaseModel
from typing import Literal


MedioPago = Literal["efectivo", "transferencia", "tarjeta", "cheque", "echeq", "cuenta_corriente"]


class PagoCreate(BaseModel):
    # Desde la migración 043 los dos son opcionales en el request, pero al
    # menos uno tiene que venir: sin alquiler del que deducir el cliente, hay
    # que decir a quién se le cobra.
    alquiler_id: int | None = None
    cliente_id: int | None = None
    monto: float
    medio_pago: MedioPago
    con_factura: bool = False
    fecha: date
    notas: str | None = None


class PagoResponse(PagoCreate):
    id: int
    cobrado_por: int
    model_config = {"from_attributes": True}


class PagoDetalladoResponse(PagoResponse):
    cliente_nombre: str | None = None
    vehiculo_patente: str | None = None
    reserva_id: int | None = None
    # Para que la UI sepa si ofrecer "Emitir recibo" o "Ver recibo".
    recibo_id: int | None = None
    recibo_numero: str | None = None


class PagoPendienteResponse(BaseModel):
    tipo: Literal["reserva", "alquiler_checkout"]
    id_origen: int
    cliente: str
    monto_total: float
    monto_abonado: float
    saldo_pendiente: float
    fecha_creacion: str
    notas: str | None = None
