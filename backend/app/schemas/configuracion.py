from datetime import datetime
from typing import Literal
from pydantic import BaseModel, field_validator

TipoConfiguracion = Literal["int", "decimal", "bool", "string"]


class ConfiguracionResponse(BaseModel):
    id: int
    clave: str
    valor: str
    tipo: TipoConfiguracion
    categoria: str
    descripcion: str
    updated_at: datetime
    model_config = {"from_attributes": True}


class ConfiguracionUpdateRequest(BaseModel):
    valor: str

    @field_validator("valor")
    @classmethod
    def _no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El valor no puede estar vacío")
        return v.strip()
