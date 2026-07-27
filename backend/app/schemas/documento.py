from datetime import datetime, date
from typing import Literal

from pydantic import BaseModel


TipoDocumento = Literal["poliza", "vtv", "clausulas", "otro", "dni", "licencia", "contrato", "reserva"]
TipoDocumentoVehiculo = Literal["poliza", "vtv", "clausulas", "otro"]
# "reserva" lo genera el sistema al crear una reserva (PDF de confirmación),
# no se sube a mano — pero se lista junto al resto de los documentos del cliente.
TipoDocumentoCliente = Literal["dni", "licencia", "contrato", "otro", "reserva"]


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
    vigencia_desde: date | None
    vigencia_hasta: date | None
    cargado_por: int

    model_config = {"from_attributes": True}
