from datetime import date, datetime

from pydantic import BaseModel, field_validator


class ContratoCreate(BaseModel):
    reserva_id: int
    # El anverso ya corregido por el operador. Si viene None se usa el que
    # arma `preparar()` — pero lo normal es que venga editado.
    snapshot: dict | None = None


class FirmarContratoRequest(BaseModel):
    nombre: str
    dni: str
    # "pantalla" | "papel". Si no viene, se deduce de si mandaron trazo.
    firma_medio: str | None = None
    # Data URL del canvas (`data:image/png;base64,...`). Opcional: se puede
    # registrar la firma en papel sin imagen.
    firma_base64: str | None = None

    @field_validator("nombre", "dni")
    @classmethod
    def _no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Quién firma y su documento son obligatorios")
        return v.strip()


class AnularContratoRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El motivo de anulación es obligatorio")
        return v.strip()


class NuevaPlantillaRequest(BaseModel):
    titulo: str
    # [{numero, titulo, parrafos: [{texto, subrayados: [[ini, fin]]}]}]
    clausulas: list


class ContratoPlantillaResponse(BaseModel):
    id: int
    version: int
    titulo: str
    clausulas: list
    vigente_desde: date
    activa: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class ContratoResponse(BaseModel):
    id: int
    numero: int | None = None
    prefijo: str
    numero_formateado: str = "—"
    reserva_id: int
    # `None` hasta el check-out: el contrato se puede emitir antes de la
    # entrega, y eso no significa que le falte nada.
    alquiler_id: int | None = None
    plantilla_id: int | None = None
    snapshot: dict | None = None
    firmado: bool
    firmado_at: datetime | None = None
    firmado_por_nombre: str | None = None
    firmado_por_dni: str | None = None
    firma_medio: str | None = None
    atendido_por: int | None = None
    anulado: bool
    motivo_anulacion: str | None = None
    fecha_generacion: datetime
    model_config = {"from_attributes": True}
