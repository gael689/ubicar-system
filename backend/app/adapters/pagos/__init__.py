"""
Elige la pasarela según la configuración.

`PAGOS_PROVIDER` vale `mercadopago` o `fake`. El default es `fake` por la
misma razón que el storage arranca en `local`: en desarrollo nadie tiene
credenciales, y fallar al arrancar la app por eso sería peor que no cobrar.
"""
from __future__ import annotations

from app.adapters.pagos.fake import PasarelaFake
from app.adapters.pagos.interface import (
    IPasarelaPago,
    PagoExterno,
    PasarelaNoConfigurada,
    PreferenciaCreada,
)
from app.adapters.pagos.mercadopago import MercadoPagoPasarela

__all__ = [
    "IPasarelaPago", "PagoExterno", "PreferenciaCreada", "PasarelaNoConfigurada",
    "MercadoPagoPasarela", "PasarelaFake", "get_pasarela", "cobro_habilitado",
]

# Instancia única de la fake, para que en desarrollo el pago creado al abrir
# el checkout siga existiendo cuando vuelve el webhook.
_fake_singleton: PasarelaFake | None = None


def cobro_habilitado() -> bool:
    """
    ¿Se puede cobrar online hoy?

    Lo consulta el endpoint público para que la web muestre el botón de pagar
    o el cartel de "coordinamos por WhatsApp", en vez de ofrecer un pago que
    va a fallar.
    """
    from app.config import settings

    if settings.pagos_provider == "fake":
        return not _es_produccion()
    return bool(settings.mercadopago_access_token)


def _es_produccion() -> bool:
    from app.config import settings

    return settings.environment == "production"


def get_pasarela() -> IPasarelaPago:
    global _fake_singleton
    from app.config import settings

    if settings.pagos_provider == "mercadopago":
        return MercadoPagoPasarela(
            settings.mercadopago_access_token,
            sandbox=settings.mercadopago_sandbox,
        )

    # Una pasarela de mentira en producción cobraría cero y confirmaría todo.
    if _es_produccion():
        raise PasarelaNoConfigurada(
            "PAGOS_PROVIDER=fake en producción: el cobro online quedaría simulado"
        )

    if _fake_singleton is None:
        _fake_singleton = PasarelaFake()
    return _fake_singleton
