"""
Los dominios de Resend: listarlos, crear uno, pedir que lo verifique.

Es lo que deja armar un subdominio de envío (`empresas.ubicar-rent.com.ar`)
**desde la pantalla de Casillas**, sin entrar al panel de Resend: se crea el
dominio, Resend devuelve los registros DNS que hay que cargar, y la pantalla
los muestra uno por uno con su estado.

Va por `httpx` y no por el SDK porque el SDK fijado en `requirements.txt`
(0.8.0) no trae los endpoints de dominios.

**Una API key de sólo-envío no puede hacer nada de esto** (Resend contesta 401
`restricted_api_key`). No es un error del sistema: se levanta `SinPermiso` y la
pantalla pasa a modo manual, con las instrucciones para hacerlo a mano.

`ResendDominiosFalso` es la versión en memoria para los tests: los tests nunca
salen a la red.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import httpx

URL_BASE = "https://api.resend.com"
TIMEOUT_S = 12.0


class ErrorDeResend(Exception):
    """Resend contestó mal o no contestó. El mensaje es legible."""


class SinPermiso(ErrorDeResend):
    """No hay API key, o la que hay es de sólo-envío."""


@dataclass(frozen=True)
class RegistroDNS:
    """Un registro que hay que cargar en el proveedor del dominio."""
    proposito: str            # SPF | DKIM | MX (lo que dice Resend)
    tipo: str                 # TXT | MX | CNAME
    nombre: str               # el "host": `send.empresas`
    valor: str
    prioridad: int | None = None
    estado: str = "pendiente"  # verificado | pendiente | fallido

    @property
    def verificado(self) -> bool:
        return self.estado == "verificado"


@dataclass(frozen=True)
class Dominio:
    id: str
    nombre: str
    estado: str               # verificado | pendiente | fallido
    registros: tuple[RegistroDNS, ...] = field(default_factory=tuple)

    @property
    def verificado(self) -> bool:
        return self.estado == "verificado"


def _estado(crudo: str | None) -> str:
    v = (crudo or "").strip().lower()
    if v == "verified":
        return "verificado"
    if v in ("failed", "temporary_failure"):
        return "fallido"
    return "pendiente"   # not_started, pending


def _dominio(d: dict) -> Dominio:
    return Dominio(
        id=str(d.get("id") or ""), nombre=str(d.get("name") or "").lower(),
        estado=_estado(d.get("status")),
        registros=tuple(
            RegistroDNS(
                proposito=str(r.get("record") or ""), tipo=str(r.get("type") or "").upper(),
                nombre=str(r.get("name") or ""), valor=str(r.get("value") or ""),
                prioridad=r.get("priority") if isinstance(r.get("priority"), int) else None,
                estado=_estado(r.get("status")),
            )
            for r in (d.get("records") or [])
        ),
    )


class ResendDominios:
    """El cliente real."""

    def __init__(self, api_key: str, *, cliente: httpx.Client | None = None) -> None:
        self._api_key = (api_key or "").strip()
        self._cliente = cliente

    def _pedir(self, metodo: str, ruta: str, json: dict | None = None) -> dict:
        if not self._api_key:
            raise SinPermiso("No hay una API key de Resend cargada.")
        try:
            cliente = self._cliente or httpx.Client(base_url=URL_BASE, timeout=TIMEOUT_S)
            try:
                r = cliente.request(metodo, ruta, json=json,
                                    headers={"Authorization": f"Bearer {self._api_key}"})
            finally:
                if self._cliente is None:
                    cliente.close()
        except httpx.HTTPError as e:
            raise ErrorDeResend(f"No se pudo hablar con Resend ({type(e).__name__}).") from None
        try:
            datos = r.json()
        except ValueError:
            datos = {}
        if r.status_code in (401, 403):
            raise SinPermiso(
                "La API key de Resend no tiene permiso para manejar dominios "
                "(es de sólo-envío, o no es válida)."
            )
        if r.status_code >= 400:
            detalle = str((datos or {}).get("message") or r.text)[:200]
            raise ErrorDeResend(f"Resend contestó {r.status_code}: {detalle}")
        return datos if isinstance(datos, dict) else {}

    def listar(self) -> list[Dominio]:
        return [_dominio(d) for d in (self._pedir("GET", "/domains").get("data") or [])]

    def obtener(self, dominio_id: str) -> Dominio:
        """Con los registros DNS y el estado de cada uno (el listado no los trae)."""
        return _dominio(self._pedir("GET", f"/domains/{dominio_id}"))

    def crear(self, nombre: str, region: str) -> Dominio:
        return _dominio(self._pedir("POST", "/domains", {"name": nombre, "region": region}))

    def verificar(self, dominio_id: str) -> None:
        """Le pide a Resend que vuelva a mirar el DNS. No espera el resultado."""
        self._pedir("POST", f"/domains/{dominio_id}/verify")


class ResendDominiosFalso:
    """
    En memoria, para los tests. `sin_permiso=True` imita una key de sólo-envío.
    `verificar()` da por buenos todos los registros, como cuando el DNS ya propagó.
    """

    def __init__(self, dominios: list[Dominio] | None = None, *, sin_permiso: bool = False) -> None:
        self.dominios: dict[str, Dominio] = {d.id: d for d in (dominios or [])}
        self.sin_permiso = sin_permiso
        self.creados: list[tuple[str, str]] = []

    def _chequear(self) -> None:
        if self.sin_permiso:
            raise SinPermiso("La API key de Resend no tiene permiso para manejar dominios.")

    def listar(self) -> list[Dominio]:
        self._chequear()
        return [Dominio(d.id, d.nombre, d.estado) for d in self.dominios.values()]

    def obtener(self, dominio_id: str) -> Dominio:
        self._chequear()
        return self.dominios[dominio_id]

    def crear(self, nombre: str, region: str) -> Dominio:
        self._chequear()
        self.creados.append((nombre, region))
        sub = nombre.split(".", 1)[0]
        d = Dominio(
            id=f"dom_{len(self.dominios) + 1}", nombre=nombre, estado="pendiente",
            registros=(
                RegistroDNS("SPF", "MX", f"send.{sub}", f"feedback-smtp.{region}.amazonses.com", 10),
                RegistroDNS("SPF", "TXT", f"send.{sub}", "v=spf1 include:amazonses.com ~all"),
                RegistroDNS("DKIM", "TXT", f"resend._domainkey.{sub}", "p=MIGfMA0GCSqGSIb3DQEB"),
            ),
        )
        self.dominios[d.id] = d
        return d

    def verificar(self, dominio_id: str) -> None:
        self._chequear()
        d = self.dominios[dominio_id]
        self.dominios[dominio_id] = Dominio(
            d.id, d.nombre, "verificado",
            tuple(RegistroDNS(r.proposito, r.tipo, r.nombre, r.valor, r.prioridad, "verificado")
                  for r in d.registros),
        )
