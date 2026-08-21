from datetime import date, time, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel


DecisionMulta = Literal["cobrada", "bonificada"]
# "cobrada"/"bonificada" sólo se alcanzan vía POST /resolver (generan el
# movimiento de cuenta corriente correspondiente) — un PATCH directo a esos
# estados dejaría el ledger desincronizado, por eso no son válidos acá.
EstadoMultaEditable = Literal["pendiente", "imputada", "apelando"]


# Los mismos valores que `Pago.medio_pago` (models/pago.py). No se reusa un
# enum del modelo porque los schemas no importan modelos.
MedioPagoMulta = Literal[
    "efectivo", "transferencia", "tarjeta", "cheque", "echeq",
    "cuenta_corriente", "mercado_pago", "wapa",
]


class ResolverMultaRequest(BaseModel):
    decision: DecisionMulta
    motivo: str | None = None  # requerido si decision == "bonificada"
    # Sólo cuando decision == "cobrada": cobrar una multa crea el `Pago` que la
    # hace entrar a la caja del día, y una caja sin medio de pago no se puede
    # arquear. Default `efectivo` porque es lo que pasa en el mostrador; la
    # pantalla lo pregunta igual.
    medio_pago: MedioPagoMulta = "efectivo"
    # La plata puede haber entrado antes de que alguien cargue la resolución.
    fecha_cobro: date | None = None


class MultaCreate(BaseModel):
    patente: str
    vehiculo_id: int | None = None
    cliente_id: int | None = None
    alquiler_id: int | None = None
    fecha_infraccion: date
    hora_infraccion: time | None = None
    # D-28: cuándo hay que pagarla. Opcional porque muchas llegan sin fecha
    # clara, y exigirla impediría cargar la multa.
    fecha_vencimiento: date | None = None
    monto: Decimal
    descripcion: str | None = None
    notas: str | None = None


class MultaUpdate(BaseModel):
    estado: EstadoMultaEditable | None = None
    monto: Decimal | None = None
    fecha_vencimiento: date | None = None
    cliente_id: int | None = None
    alquiler_id: int | None = None
    descripcion: str | None = None
    notas: str | None = None
    pdf_key: str | None = None


class VehiculoResumen(BaseModel):
    id: int
    patente: str
    marca: str
    modelo: str
    model_config = {"from_attributes": True}


class ClienteResumen(BaseModel):
    id: int
    nombre_completo: str
    dni_cuit: str
    model_config = {"from_attributes": True}


class MultaResponse(BaseModel):
    id: int
    patente: str
    vehiculo_id: int | None
    cliente_id: int | None
    alquiler_id: int | None
    fecha_infraccion: date
    hora_infraccion: time | None
    fecha_vencimiento: date | None = None
    monto: Decimal
    descripcion: str | None
    estado: str
    pdf_key: str | None
    notas: str | None
    activo: bool
    created_at: datetime
    motivo_bonificacion: str | None = None
    resuelto_por: int | None = None
    resuelto_en: datetime | None = None
    vehiculo: VehiculoResumen | None = None
    cliente: ClienteResumen | None = None
    model_config = {"from_attributes": True}


class BusquedaMultaResponse(BaseModel):
    encontrado: bool
    patente: str
    fecha_infraccion: date
    hora_infraccion: time | None
    alquiler_id: int | None = None
    cliente_id: int | None = None
    cliente_nombre: str | None = None
    cliente_dni: str | None = None
    # Conductor != pagador: si la reserva tenía un conductor designado, es
    # quien manejaba de verdad — la multa se sigue imputando al cliente
    # (quien paga/firma), pero conviene saber a quién contactar también.
    conductor_nombre: str | None = None
    conductor_dni: str | None = None
    contrato_numero: int | None = None
    fecha_checkout: date | None = None
    fecha_checkin: date | None = None
