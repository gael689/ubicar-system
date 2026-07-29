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


class IPasarelaPago(Protocol):
    def crear_preferencia(
        self,
        *,
        titulo: str,
        monto: Decimal,
        referencia_externa: str,
        email_comprador: str | None,
        url_exito: str,
        url_pendiente: str,
        url_error: str,
        url_webhook: str,
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
