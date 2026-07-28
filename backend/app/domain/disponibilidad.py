from __future__ import annotations
"""
Disponibilidad por cupo (Fase 6, ítem 60 — plan §7.3 y
docs/PLAN_RESERVAS_WEB.md §4).

Lógica pura, sin SQLAlchemy: entra el inventario ya cargado y sale el cupo.

**Por qué esto no es `domain/solapamientos.py`.** Son dos preguntas distintas:

- Solapamiento: *"¿este auto puntual está libre?"* → sí/no. Es la pregunta del
  mostrador, donde la persona ya eligió el auto.
- Cupo: *"¿cuántos Compactos quedan del 3 al 10?"* → un número. Es la pregunta
  de la web, donde el cliente elige una categoría y el auto se asigna después.

Meter la segunda dentro de la primera habría obligado a que
`detectar_solapamientos` supiera de categorías, holds y stock — tres conceptos
que no le incumben. Se mantienen separadas a propósito.

**Qué descuenta el cupo** (todo lo que ocupa una unidad de la categoría):
1. Reservas **con vehículo asignado** de esa categoría que solapan.
2. Reservas **por categoría** (sin vehículo todavía) que solapan.
3. Bloqueos de vehículo que solapan (el auto está en el taller).
4. Holds vigentes no expirados.

El punto 2 es el que se olvida y produce sobreventa: una reserva web sin auto
asignado no aparece en el solapamiento de ningún vehículo, pero **ya se vendió**.
"""
from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass(frozen=True)
class VehiculoDisponible:
    """Un auto del inventario, con su categoría."""
    id: int
    categoria_id: int | None


@dataclass(frozen=True)
class OcupacionCategoria:
    """
    Algo que ocupa una unidad en un rango. Unifica los cuatro orígenes para
    que el cálculo del cupo no tenga cuatro caminos distintos.
    """
    inicio: datetime
    fin: datetime
    categoria_id: int | None = None
    vehiculo_id: int | None = None
    origen: str = "reserva"   # reserva | bloqueo | hold


@dataclass(frozen=True)
class CupoCategoria:
    categoria_id: int
    total: int
    ocupados: int
    vehiculos_libres: list[int] = field(default_factory=list)

    @property
    def disponibles(self) -> int:
        # Nunca negativo: si algo quedó mal cargado y hay más ocupación que
        # flota, "0 disponibles" es la respuesta segura. Un número negativo
        # se propagaría a la web como si hubiera cupo.
        return max(0, self.total - self.ocupados)

    @property
    def hay_cupo(self) -> bool:
        return self.disponibles > 0

    @property
    def ultima_unidad(self) -> bool:
        """Para el badge honesto de la web: es verdad, no una presión inventada."""
        return self.disponibles == 1


def solapa(inicio_a: datetime, fin_a: datetime, inicio_b: datetime, fin_b: datetime) -> bool:
    """Mismo criterio que domain/solapamientos: adyacentes NO solapan."""
    return inicio_a < fin_b and fin_a > inicio_b


def calcular_cupo(
    categoria_id: int,
    inicio: datetime,
    fin: datetime,
    vehiculos: list[VehiculoDisponible],
    ocupaciones: list[OcupacionCategoria],
) -> CupoCategoria:
    """
    Cuántas unidades de la categoría quedan libres en el rango.

    Args:
        vehiculos: flota activa (se filtra por categoría acá).
        ocupaciones: reservas, bloqueos y holds ya normalizados.
    """
    de_la_categoria = [v for v in vehiculos if v.categoria_id == categoria_id]
    total = len(de_la_categoria)
    ids_categoria = {v.id for v in de_la_categoria}

    ocupados_por_vehiculo: set[int] = set()
    sin_vehiculo = 0

    for o in ocupaciones:
        if not solapa(inicio, fin, o.inicio, o.fin):
            continue

        if o.vehiculo_id is not None:
            # Ocupa un auto concreto: sólo cuenta si ese auto es de esta
            # categoría. Un bloqueo sobre una pick-up no baja el cupo de los
            # compactos.
            if o.vehiculo_id in ids_categoria:
                ocupados_por_vehiculo.add(o.vehiculo_id)
        elif o.categoria_id == categoria_id:
            # Reserva o hold por categoría, sin auto asignado. **Este es el
            # que produce sobreventa si se olvida**: no aparece en el
            # solapamiento de ningún vehículo, pero ya está vendido.
            sin_vehiculo += 1

    return CupoCategoria(
        categoria_id=categoria_id,
        total=total,
        # Un auto ocupado dos veces (reserva + bloqueo) se cuenta una sola,
        # de ahí el set. Los "sin vehículo" sí se suman de a uno.
        ocupados=len(ocupados_por_vehiculo) + sin_vehiculo,
        vehiculos_libres=sorted(ids_categoria - ocupados_por_vehiculo),
    )


def calcular_cupos(
    inicio: datetime,
    fin: datetime,
    vehiculos: list[VehiculoDisponible],
    ocupaciones: list[OcupacionCategoria],
    categoria_ids: list[int] | None = None,
) -> list[CupoCategoria]:
    """Cupo de todas las categorías (o de las indicadas) en un solo paso."""
    if categoria_ids is None:
        categoria_ids = sorted({
            v.categoria_id for v in vehiculos if v.categoria_id is not None
        })
    return [
        calcular_cupo(cid, inicio, fin, vehiculos, ocupaciones)
        for cid in categoria_ids
    ]


def validar_rango_web(
    inicio: datetime,
    fin: datetime,
    ahora: datetime,
    anticipacion_minima_horas: int = 24,
    duracion_maxima_dias: int = 90,
) -> None:
    """
    Reglas del rango para una reserva **pública**, que el mostrador no
    necesita: acá no hay una persona verificando que el pedido tenga sentido.

    `anticipacion_minima_horas` es la decisión #2 de
    `docs/DECISIONES_RESERVAS_WEB.md` — 24 h es el valor recomendado, pero es
    un parámetro justamente porque todavía no está confirmado.

    Levanta ValueError con un mensaje mostrable al cliente.
    """
    if fin <= inicio:
        raise ValueError("La fecha de devolución tiene que ser posterior a la de retiro")
    if inicio < ahora:
        raise ValueError("No se puede reservar para una fecha que ya pasó")

    horas_hasta_retiro = (inicio - ahora).total_seconds() / 3600
    if horas_hasta_retiro < anticipacion_minima_horas:
        raise ValueError(
            f"Las reservas online necesitan al menos {anticipacion_minima_horas} horas "
            "de anticipación. Para retirar antes, escribinos por WhatsApp."
        )

    if (fin.date() - inicio.date()).days > duracion_maxima_dias:
        raise ValueError(
            f"Para alquileres de más de {duracion_maxima_dias} días, contactanos directamente."
        )


def dias_de_alquiler(inicio: date, fin: date) -> int:
    """Igual que tarifas.calcular_duracion_dias — el día de devolución no se cobra."""
    return (fin - inicio).days
