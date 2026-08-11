"""
Canales de entrega para notificaciones — helpers de bajo nivel, sin
conocimiento de reglas ni de la tabla `notificaciones` (eso vive en
notificacion_service.py). El SDK de Resend es síncrono, así que estas
funciones lo son también: se llaman desde el job síncrono del scheduler
(ver main.py), que APScheduler corre en un thread executor.
"""
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def generar_link_whatsapp(telefono: str, mensaje: str) -> str:
    import urllib.parse
    numero = telefono.replace("+", "").replace(" ", "").replace("-", "")
    if not numero.startswith("549"):
        numero = f"549{numero}"
    return f"https://wa.me/{numero}?text={urllib.parse.quote(mensaje)}"


def enviar_email(
    destinatario: str,
    asunto: str,
    html: str,
    adjuntos: list[tuple[str, bytes]] | None = None,
) -> bool:
    """Envía un email via Resend. No-op silencioso si no hay API key
    configurada (desarrollo sin cuenta de Resend) — devuelve False.

    `adjuntos` es una lista de `(nombre_de_archivo, contenido)`. Lo usa el
    contrato firmado: mandar sólo un link obliga al cliente a guardarlo antes
    de que venza, y el adjunto le queda en la casilla sin hacer nada.
    """
    if not settings.resend_api_key:
        logger.info("[Email] resend_api_key no configurada — no se envía '%s' a %s", asunto, destinatario)
        return False
    try:
        import base64

        import resend
        resend.api_key = settings.resend_api_key
        mensaje = {
            "from": settings.from_email,
            "to": destinatario,
            "subject": asunto,
            "html": html,
        }
        if adjuntos:
            mensaje["attachments"] = [
                {"filename": nombre, "content": base64.b64encode(contenido).decode()}
                for nombre, contenido in adjuntos
            ]
        resend.Emails.send(mensaje)
        return True
    except Exception:
        logger.exception("[Email] Falló el envío de '%s' a %s", asunto, destinatario)
        return False
