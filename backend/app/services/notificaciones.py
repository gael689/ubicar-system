"""
El canal de entrega de mails — el helper de más bajo nivel, sin conocimiento
de reglas, de plantillas ni de la tabla `emails_enviados` (eso vive en
`email_service.py`). El SDK de Resend es síncrono, así que esto lo es también:
se llama desde el job síncrono del scheduler (ver main.py), que APScheduler
corre en un thread executor.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResultadoEnvio:
    """
    Cómo salió un envío.

    **Se devuelve el error y no sólo un booleano** porque el motivo es lo único
    que hace accionable una falla: "no llegó" no se puede arreglar, "el dominio
    no está verificado" sí. Sigue siendo usable como booleano (`if enviar(...)`)
    para no romper a quien sólo quiere saber si salió.
    """

    ok: bool
    error: str | None = None
    proveedor_id: str | None = None

    def __bool__(self) -> bool:
        return self.ok


def enviar_email(
    destinatario: str,
    asunto: str,
    html: str,
    adjuntos: list[tuple[str, bytes]] | None = None,
) -> ResultadoEnvio:
    """Envía un email via Resend. No-op silencioso si no hay API key
    configurada (desarrollo sin cuenta de Resend) — devuelve un resultado
    fallido con el motivo, no una excepción.

    `adjuntos` es una lista de `(nombre_de_archivo, contenido)`. Lo usa el
    contrato firmado: mandar sólo un link obliga al cliente a guardarlo antes
    de que venza, y el adjunto le queda en la casilla sin hacer nada.
    """
    if not settings.resend_api_key:
        logger.info("[Email] resend_api_key no configurada — no se envía '%s' a %s", asunto, destinatario)
        return ResultadoEnvio(ok=False, error="RESEND_API_KEY no configurada")
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
        respuesta = resend.Emails.send(mensaje)
        proveedor_id = (respuesta or {}).get("id") if isinstance(respuesta, dict) else None
        return ResultadoEnvio(ok=True, proveedor_id=proveedor_id)
    except Exception as e:
        logger.exception("[Email] Falló el envío de '%s' a %s", asunto, destinatario)
        return ResultadoEnvio(ok=False, error=f"{type(e).__name__}: {e}"[:500])
