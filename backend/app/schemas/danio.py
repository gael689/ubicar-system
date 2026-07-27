"""
Schemas de Parte de daños (Fase 4, ítems 52-53).
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, field_validator


MomentoDanio = Literal["checkout", "checkin", "preexistente"]
TipoDanio = Literal[
    "rayon", "abolladura", "rotura", "faltante",
    "cristal", "tapizado", "mecanico", "otro",
]
SeveridadDanio = Literal["leve", "moderado", "grave"]
ResponsableDanio = Literal["sin_definir", "cliente", "desgaste", "terceros"]
EstadoDanio = Literal["detectado", "valorizado", "imputado", "reparado", "bonificado"]


class FotoDanioResponse(BaseModel):
    id: int
    danio_id: int
    archivo_key: str
    descripcion: str | None = None
    url: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class DanioCreate(BaseModel):
    vehiculo_id: int
    alquiler_id: int | None = None
    cliente_id: int | None = None
    momento: MomentoDanio = "preexistente"
    zona: str
    tipo: TipoDanio = "otro"
    severidad: SeveridadDanio = "leve"
    descripcion: str | None = None
    fecha_deteccion: date | None = None
    costo_estimado: Decimal | None = None
    responsable: ResponsableDanio = "sin_definir"

    @field_validator("zona")
    @classmethod
    def _zona_no_vacia(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("La zona del daño es obligatoria")
        return v.strip()


class DanioUpdate(BaseModel):
    zona: str | None = None
    tipo: TipoDanio | None = None
    severidad: SeveridadDanio | None = None
    descripcion: str | None = None
    costo_estimado: Decimal | None = None
    responsable: ResponsableDanio | None = None
    # `estado` sólo admite las transiciones que no mueven plata. Imputar y
    # bonificar tienen sus propios endpoints porque generan asientos.
    estado: Literal["detectado", "valorizado", "reparado"] | None = None


class ImputarDanioRequest(BaseModel):
    """
    Le cobra el daño al cliente: genera el débito en su cuenta corriente.
    El monto es editable — puede ser menor al costo estimado (acuerdo
    comercial) pero no cero: para eso está bonificar.
    """
    monto: Decimal
    cliente_id: int | None = None  # si no viene, se toma el del alquiler
    concepto: str | None = None

    @field_validator("monto")
    @classmethod
    def _monto_positivo(cls, v: Decimal) -> Decimal:
        if v is None or v <= 0:
            raise ValueError("El monto a imputar debe ser mayor a cero")
        return v


class BonificarDanioRequest(BaseModel):
    """Se le perdona el daño al cliente. Si ya estaba imputado, el débito se
    revierte con un contra-asiento. Motivo obligatorio (queda auditado)."""
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El motivo de la bonificación es obligatorio")
        return v.strip()


class DanioResponse(BaseModel):
    id: int
    vehiculo_id: int
    alquiler_id: int | None
    cliente_id: int | None
    momento: MomentoDanio
    zona: str
    tipo: TipoDanio
    severidad: SeveridadDanio
    descripcion: str | None
    fecha_deteccion: date
    costo_estimado: Decimal | None
    monto_imputado: Decimal | None
    responsable: ResponsableDanio
    estado: EstadoDanio
    movimiento_cc_id: int | None
    motivo_bonificacion: str | None
    activo: bool
    registrado_por: int | None
    created_at: datetime
    fotos: list[FotoDanioResponse] = []
    # Enriquecidos en el router
    vehiculo_patente: str | None = None
    cliente_nombre: str | None = None
    model_config = {"from_attributes": True}
