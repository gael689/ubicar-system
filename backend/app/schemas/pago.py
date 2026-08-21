from datetime import date
from pydantic import BaseModel, field_validator
from typing import Literal


# `mercado_pago` (migración 051) lo genera el webhook del cobro online, pero
# también se puede cargar a mano: pasa cuando se le manda un link de pago a un
# cliente por fuera del flujo web.
#
# ⚠️ **`wapa` faltaba acá y el modelo sí lo tiene** (migración 057). El
# frontend lo viene ofreciendo en cinco pantallas —Caja, Cobros, el modal de
# reserva, los pendientes— así que un cobro por Wapa **no se podía registrar**:
# el schema lo rechazaba con un 422 que no explicaba nada. Y peor: si el `Pago`
# entraba por otro camino (una multa cobrada por Wapa, por ejemplo), **la
# respuesta reventaba con un 500** al validar el modelo contra este Literal.
#
# La lista tiene que ser exactamente la del enum de `models/pago.py`.
MedioPago = Literal[
    "efectivo", "transferencia", "tarjeta", "cheque", "echeq",
    "cuenta_corriente", "mercado_pago", "wapa",
]


class PagoCreate(BaseModel):
    # Desde la migración 043 los dos son opcionales en el request, pero al
    # menos uno tiene que venir: sin alquiler del que deducir el cliente, hay
    # que decir a quién se le cobra.
    alquiler_id: int | None = None
    cliente_id: int | None = None
    monto: float
    medio_pago: MedioPago
    con_factura: bool = False
    fecha: date
    notas: str | None = None


class PagoResponse(PagoCreate):
    id: int
    cobrado_por: int
    # De qué reserva es. Un cobro anterior al check-out —la seña— no tiene
    # alquiler todavía, así que sin esto no había forma de saber a qué operación
    # pertenecía (migración 079).
    reserva_id: int | None = None
    # Un cobro dado de baja no se borra (migración 083). Los listados lo
    # esconden por default, pero cuando se pide verlo hay que poder distinguirlo.
    #
    # Se acepta `None` y se lo trata como `False`: la columna es `NOT NULL` en
    # la base, pero un `Pago` recién construido y todavía sin `flush()` tiene el
    # atributo en `None` —el default es del INSERT, no del objeto— y serializar
    # uno de ésos no puede tirar un 500.
    anulado: bool = False
    motivo_anulacion: str | None = None
    model_config = {"from_attributes": True}

    @field_validator("anulado", mode="before")
    @classmethod
    def _sin_flush_es_false(cls, v):
        return False if v is None else v


class PagoDetalladoResponse(PagoResponse):
    cliente_nombre: str | None = None
    vehiculo_patente: str | None = None
    # Para que la UI sepa si ofrecer "Emitir recibo" o "Ver recibo".
    recibo_id: int | None = None
    recibo_numero: str | None = None


class PagoPendienteResponse(BaseModel):
    tipo: Literal["reserva", "alquiler_checkout"]
    id_origen: int
    cliente: str
    monto_total: float
    monto_abonado: float
    saldo_pendiente: float
    fecha_creacion: str
    notas: str | None = None
