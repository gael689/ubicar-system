"""
Prospectos de Ubicar: empresas que podrían alquilar, y el cruce con lo que ya hay.

Salen del buscador de leads de Gael (corre en su máquina) y llegan a Ubicar ya
curados. Acá vive la lógica pura: cómo se reconoce que **un prospecto ya es
cliente de Ubicar** y cómo se decide a quién se le puede escribir.

El cruce usa lo que tienen los dos lados: teléfono, mail, dominio propio y, como
último recurso, el nombre. **No hay CUIT del lado del buscador**, así que el
CUIT de los clientes de Ubicar no sirve para cruzar.

Orden de confianza, de mayor a menor: mail → teléfono → dominio → nombre. El
nombre es lo más flojo (dos empresas pueden llamarse igual), por eso un cruce
por nombre se marca y no se da por hecho.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urlparse

# Dominios que no identifican a una empresa: los comparte media ciudad.
DOMINIOS_COMPARTIDOS = frozenset({
    "gmail.com", "hotmail.com", "hotmail.com.ar", "outlook.com", "outlook.com.ar",
    "yahoo.com", "yahoo.com.ar", "live.com", "icloud.com", "msn.com", "proton.me",
    "protonmail.com", "wixsite.com", "linktr.ee", "facebook.com", "instagram.com",
    "wa.me", "google.com", "sites.google.com", "blogspot.com", "webnode.com",
    # Portales donde muchas empresas ponen su "web" (21/11): un hotel cuya web
    # es su ficha de Booking no es el mismo que otro con la misma web.
    "booking.com", "tripadvisor.com", "tripadvisor.com.ar", "despegar.com.ar", "airbnb.com",
    "airbnb.com.ar", "mercadolibre.com.ar", "mercadoshops.com.ar", "linkedin.com",
    "youtube.com", "tiktok.com", "x.com", "twitter.com", "bit.ly", "paginasamarillas.com.ar",
})

_MAIL_VALIDO = re.compile(r"^[^@\s,;<>]+@[a-z0-9-]+(\.[a-z0-9-]+)+$")


def mail_valido(valor: str | None) -> bool:
    """Suficiente para no mandarle a `info@empresa` o a dos mails pegados con coma."""
    return bool(_MAIL_VALIDO.match((valor or "").strip().lower()))

_SUFIJOS_SOCIETARIOS = re.compile(
    r"\b(s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?c\.?\s?a\.?|"
    r"sociedad anonima|sociedad de responsabilidad limitada|y cia|e hijos)\b"
)

ESTADOS = ("nuevo", "contactado", "respondio", "cliente", "descartado", "no_contactar")


def normalizar_telefono(valor: str | None) -> str | None:
    """Los últimos 8 dígitos: sirve igual con o sin 0, 15, +54 o 9."""
    digitos = re.sub(r"\D", "", valor or "")
    return digitos[-8:] if len(digitos) >= 8 else None


def normalizar_email(valor: str | None) -> str | None:
    v = (valor or "").strip().lower()
    return v if "@" in v else None


def dominio_propio(valor: str | None) -> str | None:
    """
    El dominio de una web o de un mail, **sólo si es de la empresa**.
    `gmail.com` o un `wixsite.com` no identifican a nadie.
    """
    v = (valor or "").strip().lower()
    if not v:
        return None
    if "@" in v:
        host = v.rsplit("@", 1)[1]
    else:
        host = urlparse(v if "//" in v else f"//{v}").hostname or ""
    host = host.removeprefix("www.").strip(".")
    if not host or "." not in host or host in DOMINIOS_COMPARTIDOS:
        return None
    if any(host.endswith("." + d) for d in DOMINIOS_COMPARTIDOS):
        return None
    return host


def normalizar_nombre(valor: str | None) -> str | None:
    """Sin tildes, sin mayúsculas, sin S.A./S.R.L. ni signos. `None` si queda corto."""
    v = unicodedata.normalize("NFKD", valor or "").encode("ascii", "ignore").decode().lower()
    v = _SUFIJOS_SOCIETARIOS.sub(" ", v)
    v = re.sub(r"[^a-z0-9 ]", " ", v)
    v = re.sub(r"\s+", " ", v).strip()
    return v if len(v) >= 4 else None


@dataclass(frozen=True)
class DatosDeContacto:
    """Lo que se sabe de alguien, de cualquiera de los dos lados."""
    nombre: str | None = None
    email: str | None = None
    telefono: str | None = None
    website: str | None = None


@dataclass(frozen=True)
class Coincidencia:
    """Con quién coincide y por qué. `por` es el criterio más fuerte que dio."""
    id: int
    por: str  # email | telefono | dominio | nombre

    @property
    def es_firme(self) -> bool:
        return self.por != "nombre"


class IndiceDeClientes:
    """
    Los clientes de Ubicar indexados por cada clave, para cruzar miles de
    prospectos sin recorrer la lista cada vez.
    """

    def __init__(self, clientes: Iterable[tuple[int, DatosDeContacto]]):
        self.por_email: dict[str, int] = {}
        self.por_telefono: dict[str, int] = {}
        self.por_dominio: dict[str, int] = {}
        self.por_nombre: dict[str, int] = {}
        for cid, d in clientes:
            self._agregar(self.por_email, normalizar_email(d.email), cid)
            self._agregar(self.por_telefono, normalizar_telefono(d.telefono), cid)
            self._agregar(self.por_dominio, dominio_propio(d.email) or dominio_propio(d.website), cid)
            self._agregar(self.por_nombre, normalizar_nombre(d.nombre), cid)

    @staticmethod
    def _agregar(indice: dict[str, int], clave: str | None, cid: int) -> None:
        if clave:
            indice.setdefault(clave, cid)

    def buscar(self, p: DatosDeContacto) -> Coincidencia | None:
        """La coincidencia más fuerte, o `None`."""
        for clave, indice, por in (
            (normalizar_email(p.email), self.por_email, "email"),
            (normalizar_telefono(p.telefono), self.por_telefono, "telefono"),
            (dominio_propio(p.website) or dominio_propio(p.email), self.por_dominio, "dominio"),
            (normalizar_nombre(p.nombre), self.por_nombre, "nombre"),
        ):
            if clave and clave in indice:
                return Coincidencia(indice[clave], por)
        return None


def motivo_para_no_escribir(
    *, ya_cliente: bool, no_contactar: bool, estado: str, sin_canal: bool,
) -> str | None:
    """
    Por qué **no** se le escribe a un prospecto, o `None` si se puede.

    Una campaña de captación no le escribe a quien ya es cliente, a quien pidió
    que no lo contacten, ni a quien no tiene por dónde.

    **El "contactado antes" se sacó** (14/10): era el historial de leadgen —a
    quién le escribió Gael—, no de Ubicar, que nunca contactó a nadie. Además de
    mostrarse en pantalla, sacaba de las campañas de Ubicar a esas empresas.
    """
    if no_contactar or estado == "no_contactar":
        return "pidió que no lo contacten"
    if ya_cliente or estado == "cliente":
        return "ya es cliente"
    if estado == "descartado":
        return "descartado"
    if sin_canal:
        return "no tiene mail ni teléfono"
    return None


def motivo_para_no_mandar_mail(
    *, ya_cliente: bool, no_contactar: bool, estado: str, email: str | None,
    recibio_hace_poco: bool = False, en_otra_campana: bool = False, mail_repetido: bool = False,
) -> str | None:
    """
    Por qué **no** le sale un mail de campaña a un prospecto, o `None` si sale.

    Suma a `motivo_para_no_escribir` lo que es propio del mail: que tenga uno
    bien escrito, que no esté dos veces en la lista, y que no se le haya
    escrito hace poco. Quien ya respondió tampoco entra: a esa empresa le
    contesta una persona, no una campaña.
    """
    base = motivo_para_no_escribir(
        ya_cliente=ya_cliente, no_contactar=no_contactar, estado=estado, sin_canal=False)
    if base:
        return base
    if estado == "respondio":
        return "ya respondió"
    if not (email or "").strip():
        return "no tiene mail"
    if not mail_valido(email):
        return "el mail está mal escrito"
    if mail_repetido:
        return "mismo mail que otra empresa de la lista"
    if en_otra_campana:
        return "ya está en otra campaña en curso"
    if recibio_hace_poco:
        return "recibió un mail nuestro en los últimos 30 días"
    return None
