"""Schemas de Adicionales (Fase 5, ítem 56 — plan §7.4)."""
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


GrupoAdicional = Literal["cobertura", "extra"]
UnidadCobro = Literal["por_dia", "unico"]


class _AdicionalValidaciones(BaseModel):
    @model_validator(mode="after")
    def _validar(self):
        grupo = getattr(self, "grupo", None)
        descuento = getattr(self, "franquicia_descuento", None)
        # El descuento de franquicia sólo tiene sentido en una cobertura: en un
        # GPS no significa nada y cargarlo sería un dato que después nadie sabe
        # leer.
        if descuento is not None and grupo == "extra":
            raise ValueError(
                "El descuento de franquicia sólo aplica a las coberturas, no a los extras"
            )
        return self


class AdicionalCreate(_AdicionalValidaciones):
    codigo: str = Field(max_length=40)
    nombre: str = Field(max_length=120)
    descripcion: str | None = None
    grupo: GrupoAdicional = "extra"
    precio: Decimal = Field(ge=0)
    unidad_cobro: UnidadCobro = "por_dia"
    incluido: bool = False
    # **Cuánto BAJA la franquicia, no cuánto queda** (migración 084). El
    # resultado depende de la base de cada categoría, y hay tres distintas.
    franquicia_descuento: Decimal | None = Field(default=None, ge=0)
    # D-53: coberturas que se cobran como % del alquiler del vehículo, no un
    # monto fijo — "30% más" tiene sentido en cualquier categoría; un monto
    # fijo no. Cuando está cargado, reemplaza a `precio`/`unidad_cobro`.
    porcentaje_sobre_alquiler: Decimal | None = Field(default=None, ge=0, le=100)
    max_cantidad: int | None = Field(default=None, ge=1)
    visible_web: bool = True
    orden: int = 0

    @field_validator("codigo")
    @classmethod
    def _codigo_normalizado(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El código es obligatorio")
        return v.strip().lower().replace(" ", "_")

    @field_validator("nombre")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()


class AdicionalUpdate(_AdicionalValidaciones):
    nombre: str | None = Field(default=None, max_length=120)
    descripcion: str | None = None
    grupo: GrupoAdicional | None = None
    precio: Decimal | None = Field(default=None, ge=0)
    unidad_cobro: UnidadCobro | None = None
    incluido: bool | None = None
    franquicia_descuento: Decimal | None = Field(default=None, ge=0)
    porcentaje_sobre_alquiler: Decimal | None = Field(default=None, ge=0, le=100)
    max_cantidad: int | None = Field(default=None, ge=1)
    visible_web: bool | None = None
    orden: int | None = None
    activo: bool | None = None


class AdicionalResponse(BaseModel):
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    grupo: GrupoAdicional
    precio: Decimal
    unidad_cobro: UnidadCobro
    incluido: bool
    # ⚠️ **Sin `= None`, esto era un campo requerido.** La migración 084 sacó
    # `Adicional.franquicia` del modelo y este schema siguió pidiéndola: Pydantic
    # no encontraba el atributo, `model_validate` levantaba, y `GET /adicionales`
    # devolvía **500**.
    #
    # Y un 500 se ve en el navegador como un error de CORS, no como un 500: la
    # respuesta de error la genera un middleware que está por **fuera** del de
    # CORS, así que sale sin la cabecera `Access-Control-Allow-Origin` y el
    # browser reporta "No 'Access-Control-Allow-Origin' header is present".
    # Perseguir eso como un problema de CORS es perder la tarde.
    franquicia_descuento: Decimal | None = None
    porcentaje_sobre_alquiler: Decimal | None = None
    max_cantidad: int | None
    visible_web: bool
    orden: int
    activo: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class AdicionalSolicitadoRequest(BaseModel):
    """Un adicional elegido, tal como llega desde la reserva o la web."""
    adicional_id: int
    cantidad: int = Field(default=1, ge=1)


class AdicionalCotizadoResponse(BaseModel):
    id: int
    nombre: str
    grupo: GrupoAdicional
    precio_unitario: Decimal
    unidad_cobro: UnidadCobro
    cantidad: int
    subtotal: Decimal
