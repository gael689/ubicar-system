"""
Lo público de la prospección: la página de baja y el webhook de Resend.

Son los dos únicos puntos a los que llega alguien **sin sesión**: la empresa
que toca "no recibir más mails" y Resend avisando qué pasó con cada envío. Van
en un router aparte de `public.py` (que es la web de reservas) porque no tienen
nada que ver con ella, pero cuelgan del mismo prefijo `/public`.
"""
from __future__ import annotations

import html
import json
import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_db
from app.core.rate_limit import limite_consultas
from app.domain import prospeccion_envio as reglas
from app.models.prospecto import Prospecto
from app.services.prospeccion_service import ProspeccionService, api_key, secreto_de_baja

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["Prospección (público)"])


# ─── La baja ─────────────────────────────────────────────────────────────────

def _pagina(titulo: str, cuerpo_html: str, status_code: int = 200) -> HTMLResponse:
    """
    Una página sola, sin scripts ni recursos de afuera: la sirve el backend
    porque el link de baja tiene que funcionar aunque la web esté caída, y
    dentro de cinco años.
    """
    return HTMLResponse(status_code=status_code, content=f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{html.escape(titulo)} · Ubicar Rent</title>
<style>
  body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
         background:#f4f6f8; color:#1c2230; }}
  main {{ max-width:440px; margin:12vh auto 0; padding:32px 24px; background:#fff;
          border:1px solid #e3e8ee; border-radius:14px; text-align:center; }}
  h1 {{ font-size:20px; line-height:1.3; margin:0 0 12px; }}
  p {{ font-size:15px; line-height:1.55; color:#55617a; margin:0 0 20px; }}
  button {{ font:inherit; font-weight:600; color:#fff; background:#1f4e79; border:0;
            border-radius:10px; padding:12px 22px; cursor:pointer; }}
  small {{ display:block; margin-top:22px; color:#8a94a6; font-size:12px; }}
  @media (max-width:480px) {{ main {{ margin:0; min-height:100vh; border:0; border-radius:0;
                                      box-sizing:border-box; padding-top:18vh; }} }}
</style></head>
<body><main>{cuerpo_html}<small>Ubicar Rent · Bahía Blanca</small></main></body></html>""")


_LISTO = ("<h1>Listo, no les escribimos más.</h1>"
          "<p>Sacamos a su empresa de nuestra lista. No van a recibir más mails de Ubicar Rent.</p>")
_INVALIDO = ("<h1>Este link no es válido.</h1>"
             "<p>Puede que esté cortado. Si quieren dejar de recibir nuestros mails, respondan "
             "cualquiera de ellos con la palabra «no» y los sacamos de la lista.</p>")
_PRUEBA = ("<h1>Este es un mail de prueba.</h1>"
           "<p>En los mails de verdad, este link le deja a la empresa darse de baja con un clic.</p>")


def _prospecto_del_token(db: Session, token: str) -> Prospecto | None:
    prospecto_id = reglas.leer_token_de_baja(secreto_de_baja(), token)
    return db.get(Prospecto, prospecto_id) if prospecto_id else None


@router.get("/baja/{token}", response_class=HTMLResponse, dependencies=[Depends(limite_consultas)])
def pagina_de_baja(token: str, db: Session = Depends(get_db)):
    """
    **Sólo pregunta: no da de baja.** Los antivirus y los filtros de correo
    abren todos los links de un mail para revisarlos; si el GET diera de baja,
    media lista quedaría dada de baja sin que nadie haya tocado nada.
    """
    if token == "prueba":
        return _pagina("Mail de prueba", _PRUEBA)
    p = _prospecto_del_token(db, token)
    if p is None:
        return _pagina("Link no válido", _INVALIDO, 404)
    if p.no_contactar:
        return _pagina("Baja confirmada", _LISTO)
    return _pagina("Confirmar baja", f"""
<h1>¿Confirmás que no querés recibir más mails de Ubicar Rent?</h1>
<p>Vamos a dejar de escribirle a <strong>{html.escape(p.nombre)}</strong>.</p>
<form method="post"><button type="submit">Sí, no quiero recibir más mails</button></form>""")


@router.post("/baja/{token}", response_class=HTMLResponse, dependencies=[Depends(limite_consultas)])
def confirmar_baja(token: str, db: Session = Depends(get_db)):
    """
    La baja de verdad: el botón de la página, y también el "Cancelar
    suscripción" de Gmail (RFC 8058), que hace este mismo POST sin mostrarle
    nada a la persona. Repetirlo no cambia nada.
    """
    if token == "prueba":
        return _pagina("Mail de prueba", _PRUEBA)
    p = _prospecto_del_token(db, token)
    if p is None:
        return _pagina("Link no válido", _INVALIDO, 404)
    ProspeccionService(db).dar_de_baja(p.id, "baja")
    return _pagina("Baja confirmada", _LISTO)


# ─── El webhook de Resend ────────────────────────────────────────────────────

def _traer_recibido(email_id: str) -> dict:
    """El cuerpo de una respuesta entrante: el webhook sólo trae los metadatos."""
    r = httpx.get(f"https://api.resend.com/emails/receiving/{email_id}",
                  headers={"Authorization": f"Bearer {api_key()}"}, timeout=10.0)
    r.raise_for_status()
    return r.json()


@router.post("/webhooks/resend-prospeccion")
async def webhook_resend(request: Request, db: Session = Depends(get_db)):
    """
    Lo que Resend avisa de cada mail: entregado, rebotó, lo marcaron como spam,
    o respondieron.

    **Sin `PROSPECCION_WEBHOOK_SECRET` contesta 404**, como si no existiera: un
    webhook sin firma sería una puerta para que cualquiera marque rebotes y
    quejas falsas y deje a toda la base como "no contactar".

    Con la firma mal contesta 401. Con la firma bien contesta **siempre 200**,
    aunque el evento no sea de una campaña: el webhook de Resend es de toda la
    cuenta y un 4xx haría que lo reintente durante horas.
    """
    secreto = settings.prospeccion_webhook_secret
    if not secreto:
        raise HTTPException(status_code=404, detail="Not Found")
    cuerpo = await request.body()
    try:
        reglas.verificar_svix(secreto, request.headers, cuerpo, datetime.utcnow())
    except reglas.FirmaInvalida as e:
        logger.warning("[Prospección] Webhook de Resend rechazado: %s", e)
        raise HTTPException(status_code=401, detail="Firma inválida") from None
    try:
        evento = json.loads(cuerpo)
    except ValueError:
        return {"ok": True, "resultado": "ignorado"}
    if not isinstance(evento, dict):
        return {"ok": True, "resultado": "ignorado"}
    resultado = ProspeccionService(db).registrar_evento(
        str(evento.get("type") or ""), evento.get("data") or {},
        traer_recibido=_traer_recibido if api_key() else None,
    )
    return {"ok": True, "resultado": resultado}
