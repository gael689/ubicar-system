"""
Schemas Pydantic para el endpoint de ocupación (calendario).
"""
from datetime import date, time
from pydantic import BaseModel


class VehiculoOcupacionItem(BaseModel):
    id: int
    patente: str
    marca: str
    modelo: str
    estado: str
    activo: bool
    model_config = {"from_attributes": True}


class EventoOcupacion(BaseModel):
    id: int
    vehiculo_id: int
    tipo: str  # "reserva" | "alquiler"
    estado: str
    fecha_inicio: date
    hora_inicio: time
    fecha_fin: date
    hora_fin: time
    cliente_nombre: str
    lugar_entrega: str = ""
    lugar_devolucion: str = ""
    precio_total: float | None = None
    notas: str | None = None
    tiene_alquiler: bool = False


class OcupacionResponse(BaseModel):
    vehiculos: list[VehiculoOcupacionItem]
    eventos: list[EventoOcupacion]
