"""Schemas del motor de precios por calendario (Fase 5, ítem 57 — plan §7.2)."""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.adicional import AdicionalCotizadoResponse, AdicionalSolicitadoRequest


CanalTarifa = Literal["ambos", "web", "mostrador"]
Canal = Literal["web", "mostrador"]


# ─── Reglas de calendario ─────────────────────────────────────────────────────

class _ReglaValidaciones(BaseModel):
    @model_validator(mode="after")
    def _validar(self):
        desde = getattr(self, "fecha_desde", None)
        hasta = getattr(self, "fecha_hasta", None)
        if desde and hasta and hasta < desde:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")

        if getattr(self, "categoria_id", None) and getattr(self, "vehiculo_id", None):
            raise ValueError(
                "Una regla es de una categoría o de un vehículo puntual, no de ambos"
            )

        # El rango se define de UNA sola forma: a mano o heredado de una fecha
        # especial. Permitir las dos deja la duda de cuál manda.
        fe = getattr(self, "fecha_especial_id", None)
        if fe and (desde or hasta):
            raise ValueError(
                "Si la regla apunta a una fecha especial, el rango se hereda de ella: "
                "no cargues fecha_desde/fecha_hasta"
            )

        dias = getattr(self, "dias_semana", None)
        if dias and any(d < 1 or d > 7 for d in dias):
            raise ValueError("dias_semana usa formato ISO: 1=lunes .. 7=domingo")

        min_d, max_d = getattr(self, "min_dias", None), getattr(self, "max_dias", None)
        if min_d is not None and max_d is not None and max_d < min_d:
            raise ValueError("max_dias no puede ser menor que min_dias")

        if getattr(self, "es_promocional", False) and not getattr(self, "etiqueta_promo", None):
            raise ValueError(
                "Una promoción necesita etiqueta_promo: es el texto que ve el cliente"
            )
        return self


class TarifaCalendarioCreate(_ReglaValidaciones):
    nombre: str
    precio_dia: Decimal = Field(gt=0)
    categoria_id: int | None = None
    vehiculo_id: int | None = None
    fecha_especial_id: int | None = None
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    dias_semana: list[int] | None = None
    prioridad: int = 0
    min_dias: int | None = Field(default=None, ge=1)
    max_dias: int | None = Field(default=None, ge=1)
    canal: CanalTarifa = "ambos"
    es_promocional: bool = False
    precio_referencia: Decimal | None = Field(default=None, gt=0)
    etiqueta_promo: str | None = Field(default=None, max_length=80)
    notas: str | None = None

    @model_validator(mode="after")
    def _rango_obligatorio(self):
        if not self.fecha_especial_id and not (self.fecha_desde and self.fecha_hasta):
            raise ValueError(
                "La regla necesita un rango de fechas, o una fecha especial de la cual heredarlo"
            )
        return self

    @field_validator("nombre")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()


class TarifaCalendarioUpdate(_ReglaValidaciones):
    nombre: str | None = None
    precio_dia: Decimal | None = Field(default=None, gt=0)
    categoria_id: int | None = None
    vehiculo_id: int | None = None
    fecha_especial_id: int | None = None
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    dias_semana: list[int] | None = None
    prioridad: int | None = None
    min_dias: int | None = Field(default=None, ge=1)
    max_dias: int | None = Field(default=None, ge=1)
    canal: CanalTarifa | None = None
    es_promocional: bool | None = None
    precio_referencia: Decimal | None = Field(default=None, gt=0)
    etiqueta_promo: str | None = Field(default=None, max_length=80)
    notas: str | None = None
    activo: bool | None = None


class TarifaCalendarioResponse(BaseModel):
    id: int
    nombre: str
    precio_dia: Decimal
    categoria_id: int | None
    vehiculo_id: int | None
    fecha_especial_id: int | None
    fecha_desde: date | None
    fecha_hasta: date | None
    dias_semana: list[int] | None
    prioridad: int
    min_dias: int | None
    max_dias: int | None
    canal: CanalTarifa
    es_promocional: bool
    precio_referencia: Decimal | None
    etiqueta_promo: str | None
    notas: str | None
    activo: bool
    created_at: datetime
    # Enriquecidos por el router para no obligar al frontend a cruzar listas.
    categoria_nombre: str | None = None
    vehiculo_patente: str | None = None
    fecha_especial_nombre: str | None = None
    # Rango efectivo: el propio, o el heredado de la fecha especial.
    vigencia_desde: date | None = None
    vigencia_hasta: date | None = None

    model_config = {"from_attributes": True}


# ─── Descuentos por duración ──────────────────────────────────────────────────

class _DescuentoValidaciones(BaseModel):
    @model_validator(mode="after")
    def _validar(self):
        desde, hasta = getattr(self, "dias_desde", None), getattr(self, "dias_hasta", None)
        if desde is not None and hasta is not None and hasta < desde:
            raise ValueError("dias_hasta no puede ser menor que dias_desde")
        return self


class DescuentoDuracionCreate(_DescuentoValidaciones):
    nombre: str
    dias_desde: int = Field(ge=1)
    dias_hasta: int | None = Field(default=None, ge=1)
    porcentaje: Decimal = Field(gt=0, le=100)
    categoria_id: int | None = None


class DescuentoDuracionUpdate(_DescuentoValidaciones):
    nombre: str | None = None
    dias_desde: int | None = Field(default=None, ge=1)
    dias_hasta: int | None = Field(default=None, ge=1)
    porcentaje: Decimal | None = Field(default=None, gt=0, le=100)
    categoria_id: int | None = None
    activo: bool | None = None


class DescuentoDuracionResponse(BaseModel):
    id: int
    nombre: str
    dias_desde: int
    dias_hasta: int | None
    porcentaje: Decimal
    categoria_id: int | None
    categoria_nombre: str | None = None
    activo: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Cotización ───────────────────────────────────────────────────────────────

class CalcularPrecioRequest(BaseModel):
    """
    Entrada de `POST /precios/calcular`, el endpoint que consumen el sistema
    interno, el cotizador y la web. Se pide categoría o vehículo: con el
    vehículo se infiere la categoría, así que la web (que reserva por
    categoría) y el mostrador (que reserva un auto puntual) usan lo mismo.
    """
    fecha_inicio: date
    fecha_fin: date
    categoria_id: int | None = None
    vehiculo_id: int | None = None
    canal: Canal = "mostrador"
    adicionales: list[AdicionalSolicitadoRequest] = Field(default_factory=list)
    # Necesaria para el recargo por franja etaria (D-38). No valida nada: sin
    # ella simplemente no se aplica ningún recargo, y la cotización sale igual.
    fecha_nacimiento: date | None = None

    @model_validator(mode="after")
    def _validar(self):
        if self.fecha_fin <= self.fecha_inicio:
            raise ValueError("La fecha de fin debe ser posterior a la de inicio")
        if self.categoria_id is None and self.vehiculo_id is None:
            raise ValueError("Indicá una categoría o un vehículo para cotizar")
        return self


class DiaCotizadoResponse(BaseModel):
    fecha: date
    precio: Decimal
    origen: Literal["calendario", "banda"]
    regla_id: int | None = None
    regla_nombre: str | None = None
    es_promocional: bool = False
    precio_referencia: Decimal | None = None
    etiqueta_promo: str | None = None


class RecargoEdadCotizadoResponse(BaseModel):
    """Recargo por edad aplicado (D-38). Va aparte de los adicionales porque
    no es algo que el cliente eligió."""
    id: int
    nombre: str
    edad: int
    monto: Decimal


class CotizacionResponse(BaseModel):
    dias: list[DiaCotizadoResponse]
    duracion_dias: int
    subtotal: Decimal
    descuento_porcentaje: Decimal
    descuento_monto: Decimal
    descuento_nombre: str | None
    subtotal_vehiculo: Decimal
    adicionales: list[AdicionalCotizadoResponse]
    total_adicionales: Decimal
    recargo_edad: RecargoEdadCotizadoResponse | None = None
    total: Decimal
    precio_dia_promedio: Decimal
    total_referencia: Decimal | None
    tiene_promocion: bool
    promociones: list[str]
    categoria_id: int | None = None
    vehiculo_id: int | None = None


class DiaCalendarioResponse(BaseModel):
    """Una celda de la pantalla de administración: qué precio rige ese día."""
    fecha: date
    precio: Decimal | None
    origen: Literal["calendario", "banda", "sin_precio"]
    regla_id: int | None = None
    regla_nombre: str | None = None
    es_promocional: bool = False
    etiqueta_promo: str | None = None


class FilaCalendarioResponse(BaseModel):
    categoria_id: int
    categoria_nombre: str
    dias: list[DiaCalendarioResponse]


class CalendarioPreciosResponse(BaseModel):
    desde: date
    hasta: date
    canal: Canal
    filas: list[FilaCalendarioResponse]
