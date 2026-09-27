from __future__ import annotations
"""
El mail que dispara una reserva web pagada: el comprobante para el cliente.

**Al equipo no se le manda nada por mail** (pedido del cliente, 27/09/2026:
"notificaciones no al mail, sólo en la plataforma"). Antes salían cinco avisos
internos —reserva web, transferencia, sin cupo, pedido de llamado y el resumen
de las 08:00— que repetían lo que ya dice la campana, y la casilla del equipo
terminaba siendo una segunda bandeja que nadie limpiaba. Cada uno de esos
hechos sigue generando su notificación en la plataforma (`notificacion_service`),
que es donde se atiende.

Lo que va al cliente no se arma acá: es la plantilla `reserva_confirmada` de
`email_plantillas.py`, la misma que se puede reenviar a mano desde el panel.
Tener dos comprobantes distintos para el mismo hecho garantizaba que uno de los
dos quedara desactualizado — y quedó.

Todo sale por `EmailService`, así que cada intento queda registrado y ninguna
falla puede tumbar la acreditación del pago.
"""
import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def confirmar_al_cliente(db: Session, reserva, pago_web) -> bool:
    """El comprobante para quien pagó — la plantilla común de reserva
    confirmada, con el PDF adjunto."""
    from app.services.email_service import EmailService

    registro = EmailService(db).enviar_reserva_confirmada(reserva, pago_web=pago_web)
    return bool(registro is not None and registro.estado == "enviado")


def notificar_reserva_pagada(db: Session, reserva, pago_web) -> dict:
    """
    El comprobante al cliente, tolerante a fallas.

    **Nunca levanta.** Se llama desde el webhook de Mercado Pago, y que falle
    un mail no puede tumbar la acreditación de un pago que ya entró.
    """
    resultado = {"cliente": False}
    try:
        resultado["cliente"] = confirmar_al_cliente(db, reserva, pago_web)
    except Exception:
        logger.exception("[Email] falló la confirmación al cliente de la reserva #%s", reserva.id)
    return resultado
