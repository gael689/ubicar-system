from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

EstadoEmail = Literal["enviado", "fallido", "omitido"]


class EmailEnviadoResponse(BaseModel):
    id: int
    tipo: str
    destinatario: str
    remitente: str
    asunto: str
    entidad_tipo: str | None
    entidad_id: int | None
    estado: EstadoEmail
    motivo: str | None
    proveedor_id: str | None
    con_adjunto: bool
    automatico: bool
    intentos: int
    created_at: datetime
    ultimo_intento_at: datetime
    model_config = {"from_attributes": True}


class EmailDetalleResponse(EmailEnviadoResponse):
    """El mismo registro con el cuerpo. Va aparte del listado porque el HTML
    de treinta mails por página es mucho más de lo que la tabla necesita."""

    cuerpo_html: str | None


class EstadoIntegracionResponse(BaseModel):
    remitente: str
    remitente_de_prueba: bool
    configurado: bool
    destinatarios_equipo: list[str]
    tipos: dict[str, str]


class DestinatarioResponse(BaseModel):
    id: int
    nombre: str
    email: str


class EnviarOfertaRequest(BaseModel):
    asunto: str = Field(min_length=1, max_length=200)
    cuerpo: str = Field(min_length=1)
    destinatarios: list[EmailStr] = Field(min_length=1)
    # Manda igual aunque el remitente sea el de prueba. La interfaz que lo
    # ofrece tiene que decir que el mail probablemente no llegue.
    forzar: bool = False

    @field_validator("asunto", "cuerpo")
    @classmethod
    def _no_vacio(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("No puede estar vacío")
        return v.strip()


class ReintentarRequest(BaseModel):
    forzar: bool = False


class PrevisualizarOfertaRequest(BaseModel):
    asunto: str = Field(min_length=1, max_length=200)
    cuerpo: str = Field(min_length=1)
