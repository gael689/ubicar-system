from datetime import datetime, date
from typing import Literal

from pydantic import BaseModel


TipoDocumento = Literal["poliza", "vtv", "clausulas", "otro", "dni", "licencia", "contrato"]
TipoDocumentoVehiculo = Literal["poliza", "vtv", "clausulas", "otro"]
TipoDocumentoCliente = Literal["dni", "licencia", "contrato", "otro"]


class DocumentoCreate(BaseModel):
    tipo: TipoDocumento
    nombre: str
    vigencia_desde: date | None = None
    vigencia_hasta: date | None = None


class DocumentoUpdate(BaseModel):
    tipo: TipoDocumento | None = None
    nombre: str | None = None
    vigencia_desde: date | None = None
    vigencia_hasta: date | None = None


class DocumentoResponse(BaseModel):
    id: int
    vehiculo_id: int | None = None
    cliente_id: int | None = None
    tipo: TipoDocumento
    nombre: str
    archivo_url: str | None = None
    fecha_carga: datetime
    vigencia_desde: str | None
    vigencia_hasta: str | None
    cargado_por: int

    model_config = {"from_attributes": True}
