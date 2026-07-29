"""
Pasarela de mentira, en memoria.

Sirve para dos cosas distintas:

1. **Los tests.** Permite ejercitar el webhook completo —incluidos el pago
   rechazado, el reintento duplicado y el monto que no coincide— sin red y sin
   cuenta.
2. **Desarrollo.** Con `PAGOS_PROVIDER=fake` el flujo web se puede recorrer de
   punta a punta en local: `init_point` apunta a un endpoint propio que simula
   la vuelta de Checkout Pro.

Lo que **no** hace es entrar en producción por descuido: la factory
(`adapters/pagos/__init__.py`) sólo la devuelve si se la pide explícitamente,
y si el entorno es `production` se niega.
"""
from __future__ import annotations

import itertools
from decimal import Decimal
from typing import Any

from app.adapters.pagos.interface import PagoExterno, PreferenciaCreada


class PasarelaFake:
    def __init__(self, *, estado_por_defecto: str = "approved") -> None:
        self.estado_por_defecto = estado_por_defecto
        self._secuencia = itertools.count(1)
        # payment_id -> PagoExterno
        self.pagos: dict[str, PagoExterno] = {}
        self.preferencias: dict[str, dict[str, Any]] = {}
        self.reembolsos: list[tuple[str, Decimal | None]] = []

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
    ) -> PreferenciaCreada:
        numero = next(self._secuencia)
        preference_id = f"fake-pref-{numero}"
        self.preferencias[preference_id] = {
            "titulo": titulo,
            "monto": Decimal(monto),
            "referencia_externa": referencia_externa,
            "email": email_comprador,
            "url_webhook": url_webhook,
        }
        # El pago queda listo de antemano: así el test puede disparar el
        # webhook sin pasar por ninguna pantalla.
        payment_id = f"fake-pay-{numero}"
        self.pagos[payment_id] = PagoExterno(
            payment_id=payment_id,
            estado=self.estado_por_defecto,
            monto=Decimal(monto),
            referencia_externa=referencia_externa,
            medio_pago="account_money",
            crudo={"simulado": True},
        )
        return PreferenciaCreada(
            preference_id=preference_id,
            init_point=f"https://fake.checkout/{preference_id}",
        )

    def obtener_pago(self, payment_id: str) -> PagoExterno:
        if payment_id not in self.pagos:
            raise RuntimeError(f"No existe el pago {payment_id}")
        return self.pagos[payment_id]

    def reembolsar(self, payment_id: str, monto: Decimal | None = None) -> dict[str, Any]:
        self.reembolsos.append((payment_id, monto))
        return {"id": f"fake-refund-{payment_id}", "status": "approved"}

    # ─── Palancas para los tests ─────────────────────────────────────────────

    def forzar_estado(self, payment_id: str, estado: str) -> None:
        """Simula un pago que se aprueba tarde, se rechaza o se devuelve."""
        pago = self.pagos[payment_id]
        self.pagos[payment_id] = PagoExterno(
            payment_id=pago.payment_id,
            estado=estado,
            monto=pago.monto,
            referencia_externa=pago.referencia_externa,
            medio_pago=pago.medio_pago,
            crudo=pago.crudo,
        )

    def forzar_monto(self, payment_id: str, monto: Decimal) -> None:
        """Simula el caso en que lo cobrado no es lo que se pidió."""
        pago = self.pagos[payment_id]
        self.pagos[payment_id] = PagoExterno(
            payment_id=pago.payment_id,
            estado=pago.estado,
            monto=Decimal(monto),
            referencia_externa=pago.referencia_externa,
            medio_pago=pago.medio_pago,
            crudo=pago.crudo,
        )

    def ultimo_payment_id(self) -> str:
        return list(self.pagos)[-1]
