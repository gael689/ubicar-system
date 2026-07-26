from app.config import settings


def generar_link_whatsapp(telefono: str, mensaje: str) -> str:
    import urllib.parse
    numero = telefono.replace("+", "").replace(" ", "").replace("-", "")
    if not numero.startswith("549"):
        numero = f"549{numero}"
    return f"https://wa.me/{numero}?text={urllib.parse.quote(mensaje)}"


async def enviar_email(destinatario: str, asunto: str, html: str) -> bool:
    if not settings.resend_api_key:
        return False
    try:
        import resend
        resend.api_key = settings.resend_api_key
        resend.Emails.send({
            "from": settings.from_email,
            "to": destinatario,
            "subject": asunto,
            "html": html,
        })
        return True
    except Exception:
        return False
