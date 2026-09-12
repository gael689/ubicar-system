from datetime import datetime

from pydantic import BaseModel, field_validator


class CodeudorIn(BaseModel):
    nombre: str
    dni: str
    domicilio: str | None = None


class PagareCreate(BaseModel):
    reserva_id: int
    # Editable: arranca en el valor del alquiler (ver `PagareService.preparar`).
    monto: float
    codeudores: list[CodeudorIn] = []


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
