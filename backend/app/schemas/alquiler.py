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
    fecha: date
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
    # D-17: late check-out (no hay estado NO_SHOW) — monto editable + motivo obligatorio
    cargo_checkout_tardio: Decimal = Decimal("0")
    motivo_checkout_tardio: str | None = None
    # D-34: si el auto sale sin contrato firmado no se bloquea, pero el motivo
    # es obligatorio y queda constancia visible en el listado de alquileres.
    motivo_sin_contrato: str | None = None
    # Los daños que se cargaron con fotos en la pantalla de entrega. Nacen antes
    # que el alquiler —el alquiler se crea al confirmar— así que se atan acá.
    # Ver `DanioService.atar_a_la_entrega`.
    danios_ids: list[int] = []

    @model_validator(mode="after")
    def _validar_motivo_checkout_tardio(self):
        if self.cargo_checkout_tardio and self.cargo_checkout_tardio > 0:
            if not self.motivo_checkout_tardio or not self.motivo_checkout_tardio.strip():
                raise ValueError("Cobrar un cargo por checkout tardío requiere un motivo")
        return self


class CheckinCreate(BaseModel):
    checkin_fecha: date
    checkin_hora: time
    checkin_km: int
    checkin_combustible: int
    checkin_descripcion: str | None = None
    checkin_estado_limpieza: str | None = None
    decision_excedente: DecisionExcedente
    horas_a_cobrar: Decimal | None = None
    monto_manual: Decimal | None = None
    motivo_bonificacion: str | None = None
    garantia_estado: str | None = None
    garantia_monto_devuelto: Decimal | None = None
    registrado_en_tiempo_real: bool = True
    pago_inmediato: PagoInmediato | None = None
    # Cargos de cierre (Fase 1, ítem 24): montos editables, sin auto-cálculo
    cargo_combustible: Decimal = Decimal("0")
    cargo_limpieza: Decimal = Decimal("0")

    @model_validator(mode="after")
    def validar_cobro_parcial(self) -> "CheckinCreate":
        if self.decision_excedente == DecisionExcedente.COBRAR_PARCIAL:
            if self.horas_a_cobrar is None or self.horas_a_cobrar <= 0:
                raise ValueError("Para cobro parcial, horas_a_cobrar debe ser > 0")
        if self.decision_excedente == DecisionExcedente.MONTO_MANUAL:
            if self.monto_manual is None or self.monto_manual <= 0:
                raise ValueError("Para monto manual, monto_manual debe ser > 0")
        if self.decision_excedente == DecisionExcedente.NO_COBRAR:
            if not self.motivo_bonificacion or not self.motivo_bonificacion.strip():
                raise ValueError("Para bonificar el excedente se requiere un motivo")
        return self


class ExtenderRequest(BaseModel):
    nueva_fecha_fin: date
    nueva_hora_fin: time
    # Lo que valen los días que se agregan. La extensión es un alquiler nuevo:
    # el precio del alquiler pasa a ser el anterior más esto, y se asienta un
    # débito sólo por la extensión.
    precio_extension: Decimal | None = None
    # Compatibilidad: el total del alquiler ya extendido, como se mandaba antes.
    # Si vienen los dos, manda `precio_extension`.
    precio_total: Decimal | None = None
    # El cliente paga la diferencia **al devolver el auto**, salvo que el
    # operador decida cobrarla en el momento. Si viene, se registra el cobro en
    # el mismo acto — igual que en el check-out y el check-in.
    pago_inmediato: PagoInmediato | None = None

    @model_validator(mode="after")
    def validar_precio(self) -> "ExtenderRequest":
        # Sin precio se re-cotizaba el período entero, y si la banda nueva
        # salía más barata quedaba asentada una bonificación que nadie decidió.
        if self.precio_extension is None and self.precio_total is None:
            raise ValueError("Falta el precio de la extensión")
        if self.precio_extension is not None and self.precio_extension <= 0:
            raise ValueError("El precio de la extensión tiene que ser mayor a cero")
        return self


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
    cargo_checkout_tardio: Decimal = Decimal("0")
    motivo_checkout_tardio: str | None = None
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
    cargo_combustible: Decimal = Decimal("0")
    cargo_limpieza: Decimal = Decimal("0")
    # Contrato
    contrato_firmado: bool
    contrato_url: str | None
    entregado_sin_contrato: bool = False
    motivo_sin_contrato: str | None = None
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
    # Lo de la extensión sola, que es lo que la pantalla muestra: el precio
    # anterior del alquiler no se muestra (la extensión es un alquiler nuevo).
    dias_agregados: int = 0
    precio_extension: Decimal | None = None
    # Lo que suman los adicionales que se cobran por día (el seguro, la silla)
    # en los días agregados. Se debita aparte de `precio_extension`: el total
    # de la extensión para el cliente es la suma de los dos.
    adicionales_extension: Decimal = Decimal("0")
    # Reservas con las que la extensión se pisa: se extiende igual y se avisa.
    warnings: list[dict] = []
