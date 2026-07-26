"""
Schemas Pydantic para Alquileres — Fase 3.
"""
from datetime import date, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, model_validator

from app.domain.enums import DecisionExcedente


# ── Request schemas ───────────────────────────────────────────────────────────

class PagoInmediato(BaseModel):
    monto: Decimal
    medio_pago: str
    fecha: str
    notas: str | None = None

class CheckoutCreate(BaseModel):
    reserva_id: int
    checkout_fecha: date
    checkout_hora: time
    checkout_km: int
    checkout_combustible: int
    checkout_descripcion: str | None = None
    checkout_estado_limpieza: str | None = None
    garantia_tipo: str | None = None
    garantia_monto: Decimal | None = None
    registrado_en_tiempo_real: bool = True
    pago_inmediato: PagoInmediato | None = None


class CheckinCreate(BaseModel):
    checkin_fecha: date
    checkin_hora: time
    checkin_km: int
    checkin_combustible: int
    checkin_descripcion: str | None = None
    checkin_estado_limpieza: str | None = None
    decision_excedente: DecisionExcedente
    horas_a_cobrar: Decimal | None = None
    motivo_bonificacion: str | None = None
    garantia_estado: str | None = None
    garantia_monto_devuelto: Decimal | None = None
    registrado_en_tiempo_real: bool = True
    pago_inmediato: PagoInmediato | None = None

    @model_validator(mode="after")
    def validar_cobro_parcial(self) -> "CheckinCreate":
        if self.decision_excedente == DecisionExcedente.COBRAR_PARCIAL:
            if self.horas_a_cobrar is None or self.horas_a_cobrar <= 0:
                raise ValueError("Para cobro parcial, horas_a_cobrar debe ser > 0")
        return self


class ExtenderRequest(BaseModel):
    nueva_fecha_fin: date
    nueva_hora_fin: time


# ── Response: excedente preview ───────────────────────────────────────────────

class PreviewExcedenteResponse(BaseModel):
    horas_excedidas: int
    minutos_excedidos_brutos: int
    tarifa_diaria: Decimal
    tarifa_hora_excedente: Decimal
    cargo_sugerido: Decimal
    aplica_dia_completo: bool
    dias_completos_cobrados: int
    dentro_de_gracia: bool


# ── Response: alquiler ────────────────────────────────────────────────────────

class UsuarioResumen(BaseModel):
    id: int
    nombre: str = ""
    model_config = {"from_attributes": True}


class AlquilerResponse(BaseModel):
    id: int
    reserva_id: int
    # Checkout
    checkout_fecha: date
    checkout_hora: time
    checkout_km: int
    checkout_combustible: int
    checkout_descripcion: str | None
    checkout_registrado_en_tiempo_real: bool
    # Checkin
    checkin_fecha: date | None
    checkin_hora: time | None
    checkin_km: int | None
    checkin_combustible: int | None
    checkin_descripcion: str | None
    checkin_registrado_en_tiempo_real: bool
    # Excedente
    horas_excedidas: Decimal
    horas_cobradas: Decimal | None
    cargo_excedente: Decimal
    excedente_bonificado: bool
    decidido_por: int | None
    motivo_bonificacion: str | None
    # Contrato
    contrato_firmado: bool
    contrato_url: str | None
    # Limpieza
    checkout_estado_limpieza: str | None = None
    checkin_estado_limpieza: str | None = None
    # Garantía
    garantia_tipo: str | None = None
    garantia_monto: Decimal | None = None
    garantia_estado: str | None = None
    garantia_monto_devuelto: Decimal | None = None
    model_config = {"from_attributes": True}


class ExtenderResponse(BaseModel):
    alquiler_id: int
    fecha_fin_anterior: date
    fecha_fin_nueva: date
    duracion_dias_anterior: int
    duracion_dias_nueva: int
    precio_anterior: Decimal | None
    precio_nuevo: Decimal | None
    diferencia: Decimal | None
