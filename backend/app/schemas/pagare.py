from datetime import datetime

from typing import Literal

from pydantic import BaseModel, field_validator


class CodeudorIn(BaseModel):
    nombre: str
    dni: str
    domicilio: str | None = None


class DeudorIn(BaseModel):
    """
    **Quién**, no sus datos: el servidor saca nombre y documento de la base.
    Así nadie emite una franquicia a nombre de alguien tipeándolo a mano.
    """
    tipo: Literal["cliente", "representante", "conductor"] = "cliente"
    conductor_id: int | None = None


class PagareCreate(BaseModel):
    reserva_id: int
    # Editable: arranca en la franquicia base de la categoría (ver
    # `PagareService.preparar`).
    monto: float
    codeudores: list[CodeudorIn] = []
    # Sin esto, el deudor es el titular, como siempre.
    deudor: DeudorIn | None = None


class FirmaCodeudorIn(BaseModel):
    """La firma de un co-deudor, en el orden en que figura en el pagaré."""
    firma_base64: str | None = None


class AnularPagareRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El motivo de anulación es obligatorio")
        return v.strip()


class PagareResponse(BaseModel):
    id: int
    numero_formateado: str = "—"
    reserva_id: int
    contrato_id: int
    snapshot: dict
    firmado: bool
    firmado_at: datetime | None = None
    firmado_por_nombre: str | None = None
    firmado_por_dni: str | None = None
    firma_medio: str | None = None
    firma_ip: str | None = None
    firmas_codeudores: list | None = None
    anulado: bool
    motivo_anulacion: str | None = None
    fecha_generacion: datetime
    tiene_escaneo: bool = False

    model_config = {"from_attributes": True}
