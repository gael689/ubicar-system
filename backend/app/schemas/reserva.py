"""
Schemas Pydantic para Reservas — Fase 3.
"""
from datetime import date, time, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, field_validator


EstadoReservaLiteral = Literal["pendiente", "confirmada", "activa", "vencida", "finalizada", "cancelada"]


# ── Schemas de vehículo/cliente embebidos en respuesta ───────────────────────

class VehiculoResumen(BaseModel):
    id: int
    patente: str
    marca: str
    modelo: str
    estado: str
    km_actual: int | None = None
    model_config = {"from_attributes": True}


class ClienteResumen(BaseModel):
    id: int
    nombre_completo: str
    model_config = {"from_attributes": True}


class ConductorResumen(BaseModel):
    id: int
    nombre_completo: str
    dni: str | None = None
    licencia_numero: str | None = None
    licencia_vencimiento: date
    model_config = {"from_attributes": True}


# ── Request schemas ───────────────────────────────────────────────────────────

class ReservaCreate(BaseModel):
    vehiculo_id: int
    cliente_id: int
    conductor_id: int | None = None
    fecha_inicio: date
    hora_inicio: time
    fecha_fin: date
    hora_fin: time
    lugar_entrega: str
    lugar_devolucion: str
    notas: str | None = None
    # D1 late checkout
    hora_devolucion_acordada: time | None = None
    late_checkout: bool = False
    cargo_late_checkout: Decimal = Decimal("0")
    precio_total: Decimal | None = None
    # Garantía
    garantia_tipo: str | None = None
    garantia_monto: Decimal | None = None
    garantia_tarjeta_numero: str | None = None
    garantia_tarjeta_vencimiento: str | None = None
    garantia_tarjeta_titular: str | None = None
    # Pago
    forma_pago_prevista: str | None = None
    estado_pago: str = "pendiente"
    anticipo_monto: Decimal | None = None
    anticipo_fecha: date | None = None
    anticipo_medio_pago: str | None = None
    con_factura: bool = False
    descuento_motivo: str | None = None
    # Condición de pago del saldo — decisión de la reserva, sin default
    # implícito de ancla (ver ReservaService.create).
    condicion_pago: str = "contado"
    condicion_pago_ancla: Literal["checkout", "checkin", "fecha_especifica"] | None = None
    condicion_pago_fecha_ancla: date | None = None
    # Factura — sólo descriptivo, sin integración AFIP real todavía.
    tipo_factura: Literal["A", "B", "C"] | None = None
    factura_a_nombre_de: str | None = None
    # Datos del echeq — opcionales, se puede dejar pendiente y completar
    # después (ver ReservaService.create / EcheqService).
    echeq_banco: str | None = None
    echeq_numero_cheque: str | None = None
    echeq_fecha_cobro: date | None = None


class ReservaUpdate(BaseModel):
    """Para edición (pendiente o confirmada según D8)."""
    vehiculo_id: int | None = None
    conductor_id: int | None = None
    fecha_inicio: date | None = None
    hora_inicio: time | None = None
    fecha_fin: date | None = None
    hora_fin: time | None = None
    lugar_entrega: str | None = None
    lugar_devolucion: str | None = None
    notas: str | None = None
    precio_total: Decimal | None = None
    # Pago
    forma_pago_prevista: str | None = None
    estado_pago: str | None = None
    anticipo_monto: Decimal | None = None
    anticipo_fecha: date | None = None
    anticipo_medio_pago: str | None = None


class ReasignarRequest(BaseModel):
    vehiculo_id_nuevo: int


class CancelarReservaRequest(BaseModel):
    """D-11: la seña no se devuelve, motivo obligatorio para la auditoría."""
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El motivo de cancelación es obligatorio")
        return v


# ── Warning de solapamiento ───────────────────────────────────────────────────

class SolapeWarning(BaseModel):
    tipo: str
    reserva_id: int
    cliente: str = ""
    fecha_inicio: str = ""
    fecha_fin: str = ""


# ── Response schemas ──────────────────────────────────────────────────────────

class ReservaResponse(BaseModel):
    id: int
    vehiculo_id: int
    cliente_id: int
    conductor_id: int | None = None
    fecha_inicio: date
    hora_inicio: time
    fecha_fin: date
    hora_fin: time
    lugar_entrega: str
    lugar_devolucion: str
    notas: str | None
    estado: EstadoReservaLiteral
    usuario_id: int
    created_at: datetime
    # D1 late checkout
    hora_devolucion_acordada: time | None
    late_checkout: bool
    cargo_late_checkout: Decimal
    # Precio y tarifa
    tarifa_aplicada_id: int | None
    precio_total: Decimal | None
    precio_lista: Decimal | None = None
    descuento_motivo: str | None = None
    descuento_autorizado_por: int | None = None
    con_factura: bool = False
    motivo_cancelacion: str | None = None
    condicion_pago: str = "contado"
    condicion_pago_ancla: str | None = None
    condicion_pago_fecha_ancla: date | None = None
    tipo_factura: str | None = None
    factura_a_nombre_de: str | None = None
    echeq_banco: str | None = None
    echeq_numero_cheque: str | None = None
    echeq_fecha_cobro: date | None = None
    # D2 solape
    bloqueada_por_solape: bool
    # Garantía
    garantia_tipo: str | None = None
    garantia_monto: Decimal | None = None
    garantia_tarjeta_numero: str | None = None
    garantia_tarjeta_vencimiento: str | None = None
    garantia_tarjeta_titular: str | None = None
    # Pago
    forma_pago_prevista: str | None = None
    estado_pago: str = "pendiente"
    anticipo_monto: Decimal | None = None
    anticipo_fecha: date | None = None
    anticipo_medio_pago: str | None = None
    # Relaciones expandidas
    vehiculo: VehiculoResumen | None = None
    cliente: ClienteResumen | None = None
    conductor: ConductorResumen | None = None
    alquiler_id: int | None = None
    alquiler_estado: str | None = None
    model_config = {"from_attributes": True}


class ReservaConWarnings(BaseModel):
    reserva: ReservaResponse
    warnings: list[SolapeWarning] = []


# ── Schemas para listado con paginación ──────────────────────────────────────

class ReservaListResponse(BaseModel):
    items: list[ReservaResponse]
    total: int
    page: int
    page_size: int


# ── Matriz de bloqueos (Fase 3, ítem 39) ──────────────────────────────────────

class BloqueoItemResponse(BaseModel):
    codigo: str
    mensaje: str
    severidad: Literal["bloqueante", "advertencia"]


class SemaforoResponse(BaseModel):
    semaforo: Literal["rojo", "amarillo", "verde"]
    items: list[BloqueoItemResponse]
