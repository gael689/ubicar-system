"""
Las reglas del envío de prospección, sin base ni red.

Todo lo que decide **desde dónde, cuándo y cuánto** se manda vive acá, puro y
testeado: la dirección de una casilla, la rampa, el reparto del cupo, el freno
automático, la ventana horaria, el token de baja y la firma del webhook. El
service (`prospeccion_service.py`) sólo junta los datos y aplica lo que esto
decide.

El diseño está portado de dos sistemas que ya mandan en frío todos los días:
BBJobs (`services/email/mailboxes.py`, `prospect_dispatch.py`, `tokens.py`,
`inbox.py`) y centro-nuevo (`correo/casillas.py`, `firma.py`). Los números son
los de ellos, porque ya están probados contra los límites reales de Resend.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Mapping, Sequence
from zoneinfo import ZoneInfo

TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")


# ─── Casillas: la dirección ──────────────────────────────────────────────────

_DIRECCION = re.compile(r"^[a-z0-9][a-z0-9._+-]{0,63}@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,5})$")

#: Si no hay nada configurado ni se puede deducir del remitente.
DOMINIO_RAIZ_POR_DEFECTO = "ubicar-rent.com.ar"


class DireccionInvalida(ValueError):
    """La dirección no sirve para una casilla. El mensaje se le muestra a quien la carga."""


def dominio_raiz(configurado: str | None, from_email: str | None) -> str:
    """
    El dominio de la empresa, del que **nunca** sale un mail en frío.

    Se toma de la configuración; si no, del remitente de los mails a clientes
    (`FROM_EMAIL`). El remitente de prueba de Resend (`@resend.dev`) no es de
    nadie, así que ahí cae al dominio de Ubicar.
    """
    v = (configurado or "").strip().lower().lstrip("@")
    if v:
        return v
    m = re.search(r"@([a-z0-9.-]+)", (from_email or "").lower())
    host = m.group(1) if m else ""
    if not host or host.endswith("resend.dev"):
        return DOMINIO_RAIZ_POR_DEFECTO
    return host


def analizar_direccion(cruda: str | None, raiz: str) -> tuple[str, str]:
    """
    `(dirección en minúsculas, subdominio)`, o `DireccionInvalida`.

    **La casilla tiene que estar en un subdominio** (`franco@empresas.<raíz>`).
    Desde la raíz salen las confirmaciones de reserva, los contratos y los
    recibos: si los mails en frío salieran de ahí y alguien los marca como spam,
    lo que se castiga es la reputación del dominio entero, y los mails a
    clientes empiezan a caer en spam también. Un subdominio tiene reputación
    propia: si se quema, se quema solo.
    """
    direccion = (cruda or "").strip().lower()
    m = _DIRECCION.match(direccion)
    if not m:
        raise DireccionInvalida("Esa dirección no es válida. Tiene que ser algo como "
                                f"franco@empresas.{raiz}.")
    dominio = m.group(1)
    if dominio == raiz:
        raise DireccionInvalida(
            f"Desde {raiz} no se mandan campañas: de ahí salen las confirmaciones de reserva y los "
            "contratos, y si un mail en frío cae en spam se lleva puesta la reputación de todo el "
            f"dominio. Usá un subdominio, por ejemplo franco@empresas.{raiz}."
        )
    if not dominio.endswith("." + raiz):
        raise DireccionInvalida(
            f"La casilla tiene que ser de un subdominio de {raiz} "
            f"(por ejemplo franco@empresas.{raiz})."
        )
    return direccion, dominio


def formatear_remitente(nombre_visible: str | None, direccion: str) -> str:
    """`Nombre visible <casilla>`, sin los caracteres que rompen la cabecera."""
    nombre = re.sub(r'["<>\r\n]', "", nombre_visible or "").strip()
    return f"{nombre} <{direccion}>" if nombre else direccion


# ─── Casillas: rampa y reparto ───────────────────────────────────────────────

LIMITE_DIA_POR_DEFECTO = 30
#: Cuántos mails por día puede mandar una casilla nueva. Un dominio recién
#: verificado que arranca mandando de a cientos es exactamente lo que hace un
#: spammer; se sube de a poco para que Gmail y Outlook lo vayan conociendo.
RAMPA_SEMANA_1 = 15
RAMPA_SEMANA_2 = 25
# Desde la tercera semana vale el límite de la casilla (30 si no se cambió).


def cupo_del_dia(limite_dia: int | None, rampa_desde: date | None, hoy: date) -> int:
    """Cuántos mails puede mandar hoy una casilla: `min(límite, rampa de su semana)`."""
    limite = limite_dia if limite_dia and limite_dia > 0 else LIMITE_DIA_POR_DEFECTO
    if rampa_desde is None:
        return limite
    semana = max(0, (hoy - rampa_desde).days // 7)
    if semana == 0:
        return min(limite, RAMPA_SEMANA_1)
    if semana == 1:
        return min(limite, RAMPA_SEMANA_2)
    return limite


@dataclass
class Cupo:
    """Una casilla activa, con lo que puede y lo que ya mandó hoy."""
    casilla_id: int
    direccion: str
    cupo: int
    usados: int

    @property
    def libres(self) -> int:
        return max(0, self.cupo - self.usados)


def elegir(cupos: Sequence[Cupo]) -> Cupo | None:
    """
    La casilla con cupo **que menos mandó hoy** (empate: orden alfabético).

    Reparto parejo a propósito: si una sola casilla se lleva todo el volumen,
    es la primera que se quema.
    """
    con_cupo = [c for c in cupos if c.libres > 0]
    return min(con_cupo, key=lambda c: (c.usados, c.direccion)) if con_cupo else None


# ─── Casillas: el freno automático ───────────────────────────────────────────

REBOTE_LIMITE_PCT = 3.0     # Resend suspende la cuenta al 4 %: se frena un punto antes
MUESTRA_MINIMA = 30         # con menos envíos se mira la cantidad, no el porcentaje
REBOTES_MUESTRA_CHICA = 3
VENTANA_DE_SALUD = 100      # los últimos envíos de la casilla que cuentan


def evaluar_freno(*, enviados: int, rebotes_duros: int, quejas: int) -> str | None:
    """
    Por qué hay que pausar una casilla, o `None` si está sana.

    - **Una queja** (alguien apretó "es spam") alcanza: es la señal más cara.
    - Con 30 envíos o más, rebote duro por encima del 3 %.
    - Con menos de 30, tres rebotes (un porcentaje sobre 10 envíos no dice nada).
    """
    if quejas:
        return f"Freno automático: {quejas} queja{'s' if quejas != 1 else ''} de spam."
    if enviados >= MUESTRA_MINIMA and 100.0 * rebotes_duros / enviados > REBOTE_LIMITE_PCT:
        pct = f"{100.0 * rebotes_duros / enviados:.1f}".replace(".", ",")
        return f"Freno automático: {rebotes_duros} rebotes en {enviados} envíos ({pct} %)."
    if enviados < MUESTRA_MINIMA and rebotes_duros >= REBOTES_MUESTRA_CHICA:
        return f"Freno automático: {rebotes_duros} rebotes en {enviados} envíos."
    return None


# ─── Cuándo se manda ─────────────────────────────────────────────────────────

#: Días hábiles, de 9 a 13 y de 15 a 18 de Argentina: cuando alguien de la
#: empresa está sentado frente a la casilla. Un mail que llega a las 3 de la
#: mañana o un domingo se lee como automático — y lo es.
FRANJAS: tuple[tuple[time, time], ...] = ((time(9, 0), time(13, 0)), (time(15, 0), time(18, 0)))

#: Segundos entre dos envíos de la misma casilla (se sortea en ese rango): una
#: persona no manda 30 mails en el mismo segundo.
ESPACIADO_MIN_S, ESPACIADO_MAX_S = 90, 240

#: No se le vuelve a escribir en frío a quien recibió una campaña hace menos.
DIAS_ENTRE_CAMPANAS = 30


def a_hora_argentina(ahora_utc: datetime) -> datetime:
    """La base guarda UTC sin zona (`datetime.utcnow()`), como el resto del sistema."""
    if ahora_utc.tzinfo is None:
        ahora_utc = ahora_utc.replace(tzinfo=timezone.utc)
    return ahora_utc.astimezone(TZ_ARGENTINA)


def en_ventana(ahora_utc: datetime) -> bool:
    local = a_hora_argentina(ahora_utc)
    return local.weekday() < 5 and any(desde <= local.time() < hasta for desde, hasta in FRANJAS)


def inicio_del_dia(ahora_utc: datetime) -> datetime:
    """Las 00:00 de hoy en Argentina, en UTC sin zona: desde ahí se cuenta el cupo."""
    local = a_hora_argentina(ahora_utc)
    medianoche = datetime.combine(local.date(), time(0), tzinfo=TZ_ARGENTINA)
    return medianoche.astimezone(timezone.utc).replace(tzinfo=None)


@dataclass(frozen=True)
class Estimacion:
    """Cuándo termina de salir el primer mensaje de una campaña."""
    termina: date | None      # `None` = sin casillas, no se puede decir
    dias: int                 # días hábiles que lleva
    por_dia: int              # cuántos salen en un día normal


def estimar_fin(
    cantidad: int, casillas: Sequence[tuple[int | None, date | None]], ahora_utc: datetime,
    *, tope_diario: int, usados_hoy: int = 0,
) -> Estimacion:
    """
    Simula el reparto día por día (con la rampa de cada casilla) para poder
    decir "termina el jueves 4/12". `casillas` es `(limite_dia, rampa_desde)` de
    cada una activa. Es una estimación: no descuenta los seguimientos, que
    usan el mismo cupo.
    """
    if cantidad <= 0 or not casillas:
        return Estimacion(None, 0, 0)
    local = a_hora_argentina(ahora_utc)
    dia = local.date()
    faltan, dias, primer_cupo = cantidad, 0, 0
    # Si hoy ya cerró la ventana, hoy no sale nada.
    hoy_sirve = local.weekday() < 5 and local.time() < FRANJAS[-1][1]
    for _ in range(400):
        if dia.weekday() < 5 and (dia != local.date() or hoy_sirve):
            cupo = min(tope_diario, sum(cupo_del_dia(l, r, dia) for l, r in casillas))
            if dia == local.date():
                cupo = max(0, cupo - usados_hoy)
            if cupo > 0:
                primer_cupo = primer_cupo or cupo
                dias += 1
                faltan -= cupo
                if faltan <= 0:
                    return Estimacion(dia, dias, primer_cupo)
        dia += timedelta(days=1)
    return Estimacion(None, dias, primer_cupo)


# ─── La baja ─────────────────────────────────────────────────────────────────

_SELLO_BAJA = b"ubicar-prospeccion-baja-v1:"


def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def _desb64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _firmar_baja(secreto: str, carga: bytes) -> bytes:
    return hmac.new(secreto.encode(), _SELLO_BAJA + carga, hashlib.sha256).digest()


def token_de_baja(secreto: str, prospecto_id: int) -> str:
    """
    `base64(id) + "." + base64(HMAC)`. **Sin tabla y sin vencimiento**: una
    baja no caduca nunca —el mail más viejo que alguien conserve tiene que
    seguir sirviendo— y firmarlo evita guardar un token por cada mail.
    El sello (`ubicar-prospeccion-baja-v1`) impide que la misma firma sirva para
    otra cosa si algún día se firma algo más con el mismo secreto.
    """
    carga = str(int(prospecto_id)).encode()
    return f"{_b64(carga)}.{_b64(_firmar_baja(secreto, carga))}"


def leer_token_de_baja(secreto: str, token: str | None) -> int | None:
    """El id del prospecto si la firma es buena; `None` en cualquier otro caso."""
    try:
        carga_b64, firma_b64 = (token or "").split(".", 1)
        carga = _desb64(carga_b64)
        if not hmac.compare_digest(_desb64(firma_b64), _firmar_baja(secreto, carga)):
            return None
        return int(carga.decode())
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None


# ─── Respuestas ──────────────────────────────────────────────────────────────

_ASUNTO_AUTOMATICO = re.compile(
    r"^\s*(re:\s*)?(respuesta autom[aá]tica|automatic reply|auto[- ]?reply|out of office|"
    r"fuera de (la )?oficina|undeliverable|delivery status notification|"
    r"mail delivery (failed|subsystem)|no se pudo entregar)", re.IGNORECASE)
# Sólo frases completas: "baja" suelta aparece en respuestas que no piden la
# baja ("la tarifa es baja"), y una baja no se deshace.
_PIDE_BAJA = re.compile(
    r"\b(d[ae]r(me|nos)?\s+de\s+baja|(pido|solicito|solicitamos|quiero|queremos|necesito)\s+(la\s+)?baja|"
    r"no\s+(me|nos)\s+(escriban|env[ií]en|manden|contacten)|"
    r"no\s+(quiero|queremos|deseo|deseamos)\s+recibir|desuscrib\w+|unsubscribe|remove\s+me)\b",
    re.IGNORECASE)
_SOLO_NO = re.compile(r"^\W*no(\W+(muchas\s+)?gracias)?\W*$", re.IGNORECASE)
_MIRA_HASTA = 600   # el pedido está al principio; no se busca en el texto citado


def es_respuesta_automatica(asunto: str | None, cabeceras: Mapping[str, str] | None = None) -> bool:
    """Un "fuera de la oficina" no es una respuesta: no corta la secuencia."""
    h = {str(k).lower(): str(v).lower() for k, v in (cabeceras or {}).items()}
    if h.get("auto-submitted", "no") != "no" or "x-autoreply" in h or "x-autorespond" in h:
        return True
    if h.get("precedence") in {"bulk", "junk", "list", "auto_reply"}:
        return True
    return bool(_ASUNTO_AUTOMATICO.search(asunto or ""))


def pide_la_baja(cuerpo: str | None) -> bool:
    """
    ¿La respuesta pide que no le escriban más? Incluye el «no» pelado, que es
    justo lo que el mail les dice que contesten.
    """
    inicio = (cuerpo or "")[:_MIRA_HASTA]
    primera = next((l for l in inicio.splitlines() if l.strip()), "")
    return bool(_SOLO_NO.match(primera) or _PIDE_BAJA.search(inicio))


# ─── La firma del webhook de Resend (Svix) ───────────────────────────────────

TOLERANCIA_FIRMA_S = 5 * 60
WEBHOOK_MAX_BYTES = 256 * 1024


class FirmaInvalida(Exception):
    """Sin firma, con firma de otro secreto, vieja o mal formada."""


def _clave_svix(secreto: str) -> bytes:
    secreto = (secreto or "").strip().removeprefix("whsec_")
    if not secreto:
        raise FirmaInvalida("sin secreto configurado")
    try:
        return base64.b64decode(secreto, validate=True)
    except (binascii.Error, ValueError):
        raise FirmaInvalida("secreto mal formado") from None


def firmar_svix(secreto: str, svix_id: str, timestamp: str, cuerpo: bytes) -> str:
    """La firma `v1,<base64>` (la usan los tests; sirve para entender el formato)."""
    contenido = f"{svix_id}.{timestamp}.".encode() + cuerpo
    return "v1," + base64.b64encode(
        hmac.new(_clave_svix(secreto), contenido, hashlib.sha256).digest()).decode()


def verificar_svix(secreto: str, cabeceras: Mapping[str, str], cuerpo: bytes, ahora_utc: datetime) -> str:
    """
    Devuelve el `svix-id` si la firma es buena; si no, `FirmaInvalida`.

    Lo firmado es `"{svix-id}.{svix-timestamp}.{cuerpo crudo}"` con HMAC-SHA256
    y la clave es el secreto sin `whsec_`, decodificado de base64.
    `svix-signature` puede traer varias firmas separadas por espacio (rotación
    de secretos): alcanza con que una coincida. Cinco minutos de tolerancia en
    el reloj, para los dos lados.
    """
    if len(cuerpo) > WEBHOOK_MAX_BYTES:
        raise FirmaInvalida("cuerpo demasiado grande")
    svix_id = (cabeceras.get("svix-id") or "").strip()
    ts = (cabeceras.get("svix-timestamp") or "").strip()
    firmas = (cabeceras.get("svix-signature") or "").strip()
    if not svix_id or not ts or not firmas or len(svix_id) > 100:
        raise FirmaInvalida("faltan cabeceras de firma")
    if not ts.isascii() or not ts.isdigit():
        raise FirmaInvalida("timestamp inválido")
    if ahora_utc.tzinfo is None:
        ahora_utc = ahora_utc.replace(tzinfo=timezone.utc)
    if abs(ahora_utc.timestamp() - int(ts)) > TOLERANCIA_FIRMA_S:
        raise FirmaInvalida("timestamp fuera de tolerancia")
    esperada = firmar_svix(secreto, svix_id, ts, cuerpo).split(",", 1)[1]
    for parte in firmas.split():
        version, _, valor = parte.partition(",")
        if version == "v1" and hmac.compare_digest(valor.encode(), esperada.encode()):
            return svix_id
    raise FirmaInvalida("ninguna firma coincide")
