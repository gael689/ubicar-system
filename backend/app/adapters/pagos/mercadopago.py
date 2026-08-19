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
    Pagador,
    PagoExterno,
    PasarelaNoConfigurada,
    PreferenciaCreada,
    ReglasCobro,
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
        pagador: Pagador,
        url_exito: str,
        url_pendiente: str,
        url_error: str,
        url_webhook: str,
        reglas: ReglasCobro = ReglasCobro(),
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
            # `binary_mode` sigue en False a propósito: en True, MP rechaza de
            # entrada todo lo que quedaría "en revisión", y ahí se pierden
            # pagos buenos. El estado `in_process` ya está contemplado en
            # `domain/pagos_web.resolver`, así que no necesitamos evitarlo.
            "binary_mode": False,
        }

        pagos = self._payment_methods(reglas)
        if pagos:
            datos["payment_methods"] = pagos

        datos_pagador = self._payer(pagador)
        if datos_pagador:
            datos["payer"] = datos_pagador

        if reglas.vence_en is not None:
            # Una preferencia sin vencimiento se puede pagar al día siguiente,
            # cuando el hold ya venció y el auto se alquiló. El pago entraría
            # igual y caería en `revision_sin_cupo` para que lo resuelva una
            # persona. Con esto, Mercado Pago lo frena antes de cobrarlo.
            datos["expires"] = True
            datos["expiration_date_to"] = _iso_utc(reglas.vence_en)

        if reglas.descriptor:
            # Lo que aparece en el resumen de la tarjeta. Sin esto sale el
            # nombre de la cuenta de MP, que el cliente no reconoce — y un
            # cargo que no se reconoce termina en un contracargo.
            datos["statement_descriptor"] = reglas.descriptor

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

    @staticmethod
    def _payment_methods(reglas: ReglasCobro) -> dict[str, Any]:
        """
        Qué medios se aceptan y en cuántas cuotas.

        **El efectivo se excluye y no es una preferencia comercial.** Rapipago
        y Pago Fácil (`ticket`) y los cajeros (`atm`) se acreditan dos o tres
        días después. El hold dura veinte minutos: para cuando la plata llega,
        el auto ya se liberó y se alquiló. El cliente pagó por algo que no
        tiene, y del otro lado queda una devolución a mano.

        Si alguna vez se decide aceptarlos, no alcanza con sacar esto: hay que
        resolver antes cómo se sostiene el cupo tres días.
        """
        pagos: dict[str, Any] = {}
        if reglas.excluir_efectivo:
            pagos["excluded_payment_types"] = [{"id": "ticket"}, {"id": "atm"}]
        if reglas.cuotas_maximas and reglas.cuotas_maximas > 0:
            # Las cuotas las paga el vendedor: cuantas más, menos queda de cada
            # reserva. Por eso el tope sale de `configuracion` y lo mueven los
            # dueños, sin deploy.
            pagos["installments"] = reglas.cuotas_maximas
        return pagos

    @staticmethod
    def _payer(pagador: Pagador) -> dict[str, Any]:
        """
        Los datos del que paga, sin campos vacíos.

        Se omite lo que no tenemos en vez de mandarlo en blanco: un
        `identification` con número vacío es peor que no mandarlo — MP lo toma
        como documento inválido.
        """
        datos: dict[str, Any] = {}
        if pagador.email:
            datos["email"] = pagador.email
        if pagador.nombre:
            datos["name"] = pagador.nombre
        if pagador.apellido:
            datos["surname"] = pagador.apellido
        if pagador.dni:
            datos["identification"] = {"type": "DNI", "number": pagador.dni}
        if pagador.telefono:
            datos["phone"] = {"number": pagador.telefono}
        return datos

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


def _iso_utc(momento) -> str:
    """
    La fecha como la quiere Mercado Pago: ISO 8601 **con offset**.

    Los timestamps del sistema son UTC sin `tzinfo`, así que el offset se
    escribe explícito. Sin él MP rechaza la preferencia entera, y el síntoma
    es un botón de pagar que falla antes de llegar al checkout.
    """
    return momento.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")
