from datetime import datetime
from pydantic import BaseModel
from typing import Literal


EstadoVehiculo = Literal["disponible", "alquilado", "reservado", "en_transicion", "fuera_de_servicio"]
TipoVehiculo = Literal["auto", "camioneta"]


class VehiculoBase(BaseModel):
    patente: str
    marca: str
    modelo: str
    anio: int
    tipo: TipoVehiculo
    color: str
    km_actual: int
    km_entre_services: int
    categoria_id: int | None = None


class VehiculoCreate(VehiculoBase):
    pass


class VehiculoUpdate(BaseModel):
    marca: str | None = None
    modelo: str | None = None
    color: str | None = None
    estado: EstadoVehiculo | None = None
    km_actual: int | None = None
    km_entre_services: int | None = None
    km_proximo_service: int | None = None
    categoria_id: int | None = None
    # activo no se cambia por PATCH: usar DELETE (baja lógica) o POST /reactivar.


class CategoriaResumen(BaseModel):
    id: int
    codigo: str
    nombre: str
    model_config = {"from_attributes": True}


class VehiculoResponse(VehiculoBase):
    id: int
    estado: EstadoVehiculo
    km_proximo_service: int
    orden: int
    activo: bool
    foto_url: str | None = None
    created_at: datetime
    categoria: CategoriaResumen | None = None

    model_config = {"from_attributes": True}


class VehiculoReorderItem(BaseModel):
    id: int
    orden: int


class VehiculoReorderRequest(BaseModel):
    vehiculos: list[VehiculoReorderItem]
