"""
El envío de un mail de prospección por Resend.

**No es `enviar_email`** (el de los mails a clientes) y no lo reemplaza: un
mail en frío necesita cosas que aquél no tiene y que no convenía meterle:

- `from` con nombre y casilla propios (`"Franco de Ubicar Rent" <franco@empresas…>`),
  no el remitente fijo de `FROM_EMAIL`;
- `reply_to`, para que las respuestas lleguen a una casilla que alguien lee;
- texto plano además del HTML;
- las cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` (RFC 8058): es lo
  que hace aparecer el "Cancelar suscripción" de Gmail, y Gmail y Yahoo las
  exigen a quien manda en volumen;
- `Idempotency-Key`: si el proceso se cae entre que Resend acepta el mail y
  que se anota como enviado, el reintento **no lo manda de nuevo** (Resend
  recuerda la clave 24 horas).

Va por `httpx` porque el SDK fijado (0.8.0) no deja pasar la clave de
idempotencia.

`EnviadorSimulado` es el que se usa fuera de producción y en los tests: no sale
nada, queda la lista de lo que habría salido.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

URL_BASE = "https://api.resend.com"
TIMEOUT_S = 15.0


@dataclass(frozen=True)
class MailDeProspeccion:
    desde: str                 # "Nombre visible <casilla>"
    para: str
    asunto: str
    texto: str
    html: str
    responder_a: str | None = None
    cabeceras: dict[str, str] = field(default_factory=dict)
    clave_idempotencia: str | None = None


@dataclass(frozen=True)
class ResultadoProspeccion:
    ok: bool
    proveedor_id: str | None = None
    error: str | None = None
    #: Vale la pena reintentar (se cayó la red, Resend está saturado). Un 422
    #: —dominio sin verificar, dirección inválida— va a fallar igual mañana.
    transitorio: bool = False
    simulado: bool = False


class EnviadorResend:
    def __init__(self, api_key: str, *, cliente: httpx.Client | None = None) -> None:
        self._api_key = api_key
        self._cliente = cliente

    def enviar(self, mail: MailDeProspeccion) -> ResultadoProspeccion:
        cuerpo: dict = {
            "from": mail.desde, "to": [mail.para], "subject": mail.asunto,
            "text": mail.texto, "html": mail.html,
        }
        if mail.responder_a:
            cuerpo["reply_to"] = mail.responder_a
        if mail.cabeceras:
            cuerpo["headers"] = mail.cabeceras
        cabeceras = {"Authorization": f"Bearer {self._api_key}"}
        if mail.clave_idempotencia:
            cabeceras["Idempotency-Key"] = mail.clave_idempotencia
        try:
            cliente = self._cliente or httpx.Client(base_url=URL_BASE, timeout=TIMEOUT_S)
            try:
                r = cliente.post("/emails", json=cuerpo, headers=cabeceras)
            finally:
                if self._cliente is None:
                    cliente.close()
        except httpx.HTTPError as e:
            logger.warning("[Prospección] Sin respuesta de Resend al mandar a %s: %s", mail.para, e)
            return ResultadoProspeccion(False, error=f"Sin respuesta de Resend ({type(e).__name__})",
                                        transitorio=True)
        try:
            datos = r.json()
        except ValueError:
            datos = {}
        if r.status_code < 300:
            return ResultadoProspeccion(True, proveedor_id=str((datos or {}).get("id") or "") or None)
        detalle = str((datos or {}).get("message") or r.text)[:300]
        return ResultadoProspeccion(
            False, error=f"Resend {r.status_code}: {detalle}",
            transitorio=r.status_code == 429 or r.status_code >= 500,
        )


class EnviadorSimulado:
    """No manda nada: anota. `falla_con` deja probar el camino del error."""

    def __init__(self, *, falla_con: ResultadoProspeccion | None = None) -> None:
        self.enviados: list[MailDeProspeccion] = []
        self.falla_con = falla_con

    def enviar(self, mail: MailDeProspeccion) -> ResultadoProspeccion:
        if self.falla_con is not None:
            return self.falla_con
        self.enviados.append(mail)
        return ResultadoProspeccion(True, proveedor_id=f"sim_{uuid.uuid4().hex}", simulado=True)
