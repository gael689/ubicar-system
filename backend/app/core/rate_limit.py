"""
Límite de peticiones para los endpoints públicos.

**El problema concreto que resuelve.** `POST /public/holds` toma cupo real sin
pedir nada a cambio. Sin límite, un script puede pedir holds en loop y **dejar
toda la flota sin disponibilidad en segundos**, sin pagar un peso. Los holds
vencen solos a los 20 minutos, pero mientras tanto la web no tiene nada que
vender.

**Implementación deliberadamente simple: en memoria, sin Redis.** El sistema
corre en un proceso (Railway), así que un contador por IP en memoria alcanza y
no agrega una dependencia de infraestructura para resolver algo que todavía no
es un problema de escala.

Lo que hay que saber si esto cambia:
- **Con varias instancias**, cada una lleva su propio contador, así que el
  límite efectivo se multiplica por la cantidad de instancias. Sigue frenando
  el abuso grosero, pero deja de ser exacto.
- **En serverless** el proceso muere entre requests y el contador se pierde:
  ahí sí hace falta Redis o el rate limiting del proveedor.

Es una ventana deslizante y no un balde: contar peticiones en los últimos N
segundos evita que alguien mande la ráfaga entera justo al cambiar el minuto.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status


class LimitadorPorIP:
    """Ventana deslizante en memoria."""

    def __init__(self, maximo: int, ventana_segundos: int, nombre: str = "") -> None:
        self.maximo = maximo
        self.ventana = ventana_segundos
        self.nombre = nombre
        self._peticiones: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _limpiar(self, cola: deque[float], ahora: float) -> None:
        limite = ahora - self.ventana
        while cola and cola[0] < limite:
            cola.popleft()

    def permitir(self, ip: str) -> tuple[bool, int]:
        """(permitido, segundos_para_reintentar)."""
        ahora = time.monotonic()
        with self._lock:
            cola = self._peticiones[ip]
            self._limpiar(cola, ahora)

            if len(cola) >= self.maximo:
                espera = int(self.ventana - (ahora - cola[0])) + 1
                return False, max(espera, 1)

            cola.append(ahora)

            # Housekeeping: sin esto el diccionario crece con cada IP que pasó
            # alguna vez. Se hace de a ratos, no en cada request.
            if len(self._peticiones) > 5_000:
                self._purgar(ahora)
            return True, 0

    def _purgar(self, ahora: float) -> None:
        vacias = [ip for ip, c in self._peticiones.items() if not c or c[-1] < ahora - self.ventana]
        for ip in vacias:
            self._peticiones.pop(ip, None)


def ip_del_cliente(request: Request) -> str:
    """
    La IP real detrás del proxy.

    Railway y Vercel ponen la IP original en `X-Forwarded-For`; sin mirarla,
    **todas las peticiones parecerían venir del proxy** y el límite se aplicaría
    al tráfico entero como si fuera un solo visitante.
    """
    reenviada = request.headers.get("x-forwarded-for")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


def crear_dependencia(maximo: int, ventana_segundos: int, mensaje: str):
    """Arma una dependencia de FastAPI que aplica el límite."""
    limitador = LimitadorPorIP(maximo, ventana_segundos)

    async def verificar(request: Request) -> None:
        permitido, espera = limitador.permitir(ip_del_cliente(request))
        if not permitido:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=mensaje,
                headers={"Retry-After": str(espera)},
            )

    return verificar


# ─── Límites ──────────────────────────────────────────────────────────────────
# Los números son generosos para una persona real y ajustados para un script.
# Una familia detrás de un mismo router comparte IP, así que apretar de más
# significaría bloquear clientes de verdad.

limite_consultas = crear_dependencia(
    maximo=60, ventana_segundos=60,
    mensaje="Demasiadas consultas seguidas. Esperá un momento y volvé a intentar.",
)

# Mucho más ajustado: cada hold toma cupo real. Nadie legítimo necesita más de
# unos pocos por minuto.
limite_holds = crear_dependencia(
    maximo=8, ventana_segundos=60,
    mensaje="Estás reservando demasiado seguido. Esperá un minuto y volvé a intentar.",
)

limite_solicitudes = crear_dependencia(
    maximo=5, ventana_segundos=300,
    mensaje="Ya recibimos tu solicitud. Te vamos a contactar a la brevedad.",
)
