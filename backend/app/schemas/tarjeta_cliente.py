from datetime import datetime
from pydantic import BaseModel, field_validator
import re


class TarjetaClienteCreate(BaseModel):
    nombre_completo: str
    nro_tarjeta: str
    vencimiento: str  # MM/AA formato
    codigo_3_digitos: str
    dni_titular: str

    @field_validator("nro_tarjeta")
    @classmethod
    def validate_nro(cls, v: str) -> str:
        clean = re.sub(r"\s", "", v)
        if not re.match(r"^\d{13,19}$", clean):
            raise ValueError("Número de tarjeta inválido")
        return clean

    @field_validator("vencimiento")
    @classmethod
    def validate_vencimiento(cls, v: str) -> str:
        if not re.match(r"^\d{2}/\d{2}$", v):
            raise ValueError("Formato debe ser MM/AA")
        return v

    @field_validator("codigo_3_digitos")
    @classmethod
    def validate_codigo(cls, v: str) -> str:
        if not re.match(r"^\d{3,4}$", v):
            raise ValueError("Código debe tener 3 o 4 dígitos")
        return v


class TarjetaClienteResponse(BaseModel):
    id: int
    cliente_id: int
    nombre_completo: str
    nro_tarjeta: str
    vencimiento: str
    codigo_3_digitos: str
    dni_titular: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
