from datetime import date, time, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel


DecisionMulta = Literal["cobrada", "bonificada"]


class ResolverMultaRequest(BaseModel):
    decision: DecisionMulta
    motivo: str | None = None  # requerido si decision == "bonificada"


class MultaCreate(BaseModel):
    patente: str
    vehiculo_id: int | None = None
    cliente_id: int | None = None
    alquiler_id: int | None = None
    fecha_infraccion: date
    hora_infraccion: time | None = None
    monto: Decimal
    descripcion: str | None = None
    notas: str | None = None


class MultaUpdate(BaseModel):
    estado: str | None = None
    monto: Decimal | None = None
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
    contrato_numero: int | None = None
    fecha_checkout: date | None = None
    fecha_checkin: date | None = None
