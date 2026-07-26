from __future__ import annotations
"""
Lógica pura de detección de solapamientos.
Sin dependencias externas — testeable de forma aislada.

Reglas (D2):
- Solapamiento contra confirmada/activa → bloqueante (409)
- Solapamiento contra pendiente → warning (200 con warnings)
- Ventanas adyacentes (fin_a == inicio_b) → NO solapan
"""
from dataclasses import dataclass
from datetime import datetime

from app.domain.ventana import VentanaReserva


# Estados que bloquean nuevas reservas
# "vencida" bloquea igual que "activa": el auto sigue afuera, no volvió.
ESTADOS_BLOQUEANTES = {"confirmada", "activa", "vencida"}

# Estados que solo generan advertencia
ESTADOS_ADVERTENCIA = {"pendiente"}


@dataclass
class ResultadoSolapamiento:
    hay_conflicto_bloqueante: bool
    conflictos_bloqueantes: list[VentanaReserva]
    conflictos_advertencia: list[VentanaReserva]

    @property
    def hay_advertencia(self) -> bool:
        return bool(self.conflictos_advertencia)


def hay_solapamiento(
    inicio_a: datetime,
    fin_a: datetime,
    inicio_b: datetime,
    fin_b: datetime,
) -> bool:
    """
    True si los dos rangos se superponen.
    Ventanas adyacentes (fin_a == inicio_b) NO solapan.
    """
    return inicio_a < fin_b and fin_a > inicio_b


def detectar_solapamientos(
    vehiculo_id: int,
    inicio: datetime,
    fin: datetime,
    ventanas: list[VentanaReserva],
    excluir_id: int | None = None,
) -> ResultadoSolapamiento:
    """
    Detecta solapamientos de una ventana propuesta contra las existentes.

    Args:
        vehiculo_id: vehículo que se quiere reservar.
        inicio: inicio de la ventana propuesta.
        fin: fin de la ventana propuesta.
        ventanas: ventanas existentes (de cualquier vehículo — se filtra aquí).
        excluir_id: ID de la reserva que se está editando (para no conflictuar consigo misma).

    Returns:
        ResultadoSolapamiento con listas de conflictos bloqueantes y advertencias.
    """
    bloqueantes: list[VentanaReserva] = []
    advertencias: list[VentanaReserva] = []

    for v in ventanas:
        if v.vehiculo_id != vehiculo_id:
            continue
        if excluir_id is not None and v.id == excluir_id:
            continue
        if v.estado not in ESTADOS_BLOQUEANTES and v.estado not in ESTADOS_ADVERTENCIA:
            continue
        if not hay_solapamiento(inicio, fin, v.inicio, v.fin):
            continue

        if v.estado in ESTADOS_BLOQUEANTES:
            bloqueantes.append(v)
        else:
            advertencias.append(v)

    return ResultadoSolapamiento(
        hay_conflicto_bloqueante=bool(bloqueantes),
        conflictos_bloqueantes=bloqueantes,
        conflictos_advertencia=advertencias,
    )
