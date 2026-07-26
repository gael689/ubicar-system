from datetime import datetime
from pydantic import BaseModel, model_validator
from typing import Literal, Optional


TipoCliente = Literal["particular", "empresa"]


class ConductorAdicionalBase(BaseModel):
    nombre_completo: str
    dni: Optional[str] = None
    licencia_numero: Optional[str] = None
    licencia_vencimiento: str


class ConductorAdicionalCreate(ConductorAdicionalBase):
    pass


class ConductorAdicionalResponse(ConductorAdicionalBase):
    id: int
    cliente_id: int
    model_config = {"from_attributes": True}


class ClienteBase(BaseModel):
    nombre_completo: str
    dni_cuit: str = ""
    telefono: str = ""
    email: str | None = None
    licencia_numero: str | None = None
    licencia_vencimiento: str = ""
    licencia_categoria: str | None = None
    tipo: TipoCliente = "particular"
    es_frecuente: bool = False
    notas: str | None = None

    @model_validator(mode='after')
    def check_contact(self) -> 'ClienteBase':
        if not self.telefono and not self.email:
            raise ValueError("Debe proporcionar al menos un teléfono o un email")
        return self


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre_completo: str | None = None
    dni_cuit: str | None = None
    telefono: str | None = None
    email: str | None = None
    licencia_numero: str | None = None
    licencia_vencimiento: str | None = None
    licencia_categoria: str | None = None
    tipo: TipoCliente | None = None
    es_frecuente: bool | None = None
    notas: str | None = None
    activo: bool | None = None


class ClienteResponse(ClienteBase):
    id: int
    activo: bool
    created_at: datetime
    conductores_adicionales: list[ConductorAdicionalResponse] = []
    model_config = {"from_attributes": True}
