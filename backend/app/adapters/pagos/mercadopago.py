"""
Mercado Pago — Checkout Pro.

El SDK se importa dentro de los métodos, igual que `boto3` en el adaptador de
S3: sin credenciales cargadas nadie instancia esta clase, y el arranque de la
app no tiene por qué depender de una dependencia que en desarrollo no se usa.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from app.adapters.pagos.interface import (
    PagoExterno,
    PasarelaNoConfigurada,
    PreferenciaCreada,
)

logger = logging.getLogger(__name__)


class MercadoPagoPasarela:
    def __init__(self, access_token: str, *, sandbox: bool = False) -> None:
        if not access_token:
            raise PasarelaNoConfigurada(
                "Falta MERCADOPAGO_ACCESS_TOKEN — el cobro online está apagado"
            )
        self.access_token = access_token
        self.sandbox = sandbox

    def _sdk(self):
        import mercadopago

        return mercadopago.SDK(self.access_token)

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
        datos: dict[str, Any] = {
            "items": [{
                "title": titulo,
                "quantity": 1,
                "unit_price": float(monto),
                "currency_id": "ARS",
            }],
            # Vuelve tal cual en el webhook: es como se encuentra la reserva
            # sin depender de que el navegador nos diga cuál era.
            "external_reference": referencia_externa,
            "notification_url": url_webhook,
            "back_urls": {
                "success": url_exito,
                "pending": url_pendiente,
                "failure": url_error,
            },
            "auto_return": "approved",
            # Una sola cuota de crédito no; que el cliente elija. Pero el
            # cobro en cuotas lo absorbe la empresa, así que esto queda como
            # está hasta que Franco y Martín decidan si lo quieren limitar.
            "binary_mode": False,
        }
        if email_comprador:
            datos["payer"] = {"email": email_comprador}

        respuesta = self._sdk().preference().create(datos)
        cuerpo = respuesta.get("response", {})
        if respuesta.get("status") not in (200, 201):
            logger.error("[MercadoPago] preferencia rechazada: %s", cuerpo)
            raise RuntimeError(
                f"Mercado Pago rechazó la preferencia: {cuerpo.get('message', cuerpo)}"
            )

        init_point = (
            cuerpo.get("sandbox_init_point") if self.sandbox else cuerpo.get("init_point")
        ) or cuerpo.get("init_point")

        return PreferenciaCreada(preference_id=cuerpo["id"], init_point=init_point)

    def obtener_pago(self, payment_id: str) -> PagoExterno:
        """
        Se consulta la API en vez de creerle al webhook.

        El webhook sólo trae un id: el cuerpo de la notificación no está
        firmado de forma que podamos confiar en el monto, y ese monto es
        justamente lo que decide si se confirma una reserva.
        """
        respuesta = self._sdk().payment().get(payment_id)
        cuerpo = respuesta.get("response", {})
        if respuesta.get("status") != 200:
            raise RuntimeError(f"No se pudo leer el pago {payment_id}: {cuerpo}")

        return PagoExterno(
            payment_id=str(cuerpo.get("id")),
            estado=cuerpo.get("status", ""),
            monto=Decimal(str(cuerpo.get("transaction_amount", "0"))),
            referencia_externa=cuerpo.get("external_reference"),
            medio_pago=cuerpo.get("payment_method_id"),
            crudo=cuerpo,
        )

    def reembolsar(self, payment_id: str, monto: Decimal | None = None) -> dict[str, Any]:
        """
        Devolución total o parcial.

        **No se llama sola desde ningún lado.** La decisión #5 (cómo y cuándo
        se devuelve) sigue abierta, y hasta que esté cerrada la devolución la
        dispara una persona desde la bandeja de Reservas web.
        """
        sdk = self._sdk()
        if monto is None:
            respuesta = sdk.refund().create(payment_id)
        else:
            respuesta = sdk.refund().create(payment_id, {"amount": float(monto)})

        cuerpo = respuesta.get("response", {})
        if respuesta.get("status") not in (200, 201):
            raise RuntimeError(f"Mercado Pago rechazó la devolución: {cuerpo}")
        return cuerpo
