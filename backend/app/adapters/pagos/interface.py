"""
La pasarela de pagos detrás de una interfaz.

Mismo patrón que `adapters/storage`: el service no sabe si del otro lado hay
Mercado Pago o un doble en memoria. Acá eso no es una abstracción de más —
**es lo que permite tener el cobro online escrito y testeado antes de que
exista la cuenta**, y lo que permite después probar los caminos que la API
real casi nunca produce a pedido (un pago rechazado, un webhook duplicado, un
monto que no coincide).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol


@dataclass(frozen=True)
class PreferenciaCreada:
    """Lo que hay que guardar y a dónde hay que mandar al cliente."""

    preference_id: str
    # URL de Checkout Pro. `sandbox_init_point` en pruebas, `init_point` en
    # producción — el adaptador ya devuelve la que corresponde.
    init_point: str


@dataclass(frozen=True)
class PagoExterno:
    """
    Un pago tal como lo cuenta la pasarela. **Es la fuente de verdad** (regla
    1 de §6): el cliente puede cerrar la pestaña antes de volver al sitio y el
    pago igual entra.
    """

    payment_id: str
    estado: str                    # `status` crudo de Mercado Pago
    monto: Decimal
    referencia_externa: str | None
    medio_pago: str | None = None
    crudo: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Pagador:
    """
    Quién paga, tal como lo pide Mercado Pago.

    Antes viajaba sólo el email. Los demás campos no son decorativos: MP los
    usa para decidir si aprueba la operación, y una tarjeta legítima que llega
    sin nombre ni documento tiene más chances de salir rechazada. Todos los
    datos ya los tenemos —el paso 4 de la web los pide para la reserva—, así
    que no cargarlos era regalar aprobaciones.
    """

    email: str | None = None
    nombre: str | None = None
    apellido: str | None = None
    telefono: str | None = None
    dni: str | None = None


@dataclass(frozen=True)
class ReglasCobro:
    """
    Las restricciones del cobro, que salen del negocio y no de la pasarela.

    `vence_en` es la que más importa: sin ella la preferencia vive para
    siempre y alguien puede pagar al día siguiente un auto cuyo hold venció
    hace horas. Ver `MercadoPagoPasarela.crear_preferencia`.
    """

    cuotas_maximas: int | None = None   # None o <=0: lo que MP ofrezca por defecto
    excluir_efectivo: bool = True
    vence_en: datetime | None = None    # UTC, sin tzinfo (como el resto del sistema)
    descriptor: str | None = None       # lo que ve el cliente en el resumen de la tarjeta


class IPasarelaPago(Protocol):
    def crear_preferencia(
        self,
        *,
        titulo: str,
        monto: Decimal,
        referencia_externa: str,
        pagador: Pagador,
        url_exito: str,
        url_pendiente: str,
        url_error: str,
        url_webhook: str,
        reglas: ReglasCobro = ReglasCobro(),
    ) -> PreferenciaCreada: ...

    def obtener_pago(self, payment_id: str) -> PagoExterno: ...

    def reembolsar(self, payment_id: str, monto: Decimal | None = None) -> dict[str, Any]: ...


class PasarelaNoConfigurada(RuntimeError):
    """
    Se intentó cobrar sin credenciales.

    Es un error explícito y no un no-op silencioso: a diferencia de un email
    que no se manda, una reserva que se cree creyendo que cobró es una entrega
    de auto sin plata.
    """
