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
from datetime import date, datetime, timedelta

from app.domain.ventana import VentanaReserva


# Estados que bloquean nuevas reservas
# "vencida" bloquea igual que "activa": el auto sigue afuera, no volvió.
# "bloqueo" es un BloqueoVehiculo (mantenimiento, siniestro, uso interno):
# entra como una ventana más para que un auto en el taller rechace reservas
# por el mismo camino que una reserva confirmada, sin una segunda validación
# paralela que después se desincronice.
ESTADOS_BLOQUEANTES = {"confirmada", "activa", "vencida", "bloqueo"}

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


# Cuánto se ensancha, de cada lado, el rango con el que se van a **buscar** las
# ventanas candidatas en la base. Ver `rango_de_carga`.
MARGEN_CARGA_DIAS = 1


def rango_de_carga(inicio: datetime, fin: datetime) -> tuple[date, date]:
    """
    El rango de **fechas** con el que hay que ir a buscar las ventanas que
    podrían solapar con el rango de **datetimes** pedido.

    Existe porque las ventanas se guardan como fecha + hora en columnas
    separadas y se consultan por fecha, pero el solapamiento se decide por
    datetime. Traducir de uno al otro a ojo es donde se pierde una ventana.

    **El margen de un día no es paranoia, es la traducción.** Una reserva que
    termina el 9 a las 23:00 solapa con una que empieza el 10 a las 00:30 sólo
    si se mira la hora; por fecha, `fecha_fin (9) >= inicio.date() (10)` es
    falso y esa ventana no se traería. Un día de más no cuesta nada —son unas
    pocas filas— y uno de menos es una reserva doble que nadie ve hasta el día
    de la entrega.

    El invariante que esto garantiza, y que fija `test_rango_de_carga`: **toda
    ventana que pueda solapar con `[inicio, fin]` entra en el rango devuelto.**
    Traer de más es aceptable; `detectar_solapamientos` descarta lo que no
    solapa de verdad. Traer de menos, no.
    """
    margen = timedelta(days=MARGEN_CARGA_DIAS)
    return (inicio.date() - margen, fin.date() + margen)


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
