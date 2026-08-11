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
from datetime import date, datetime, timedelta


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


# ─── Preparación y ventana de rotación ───────────────────────────────────────
#
# **Un auto que vuelve no está listo en el mismo instante en que entra.** Hay
# que limpiarlo, cargarlo y revisarlo, y eso lleva un par de horas.
#
# Esto arregla dos cosas que son la misma:
#
# 1. **Lo que se vendía mal.** `solapa()` trata los rangos adyacentes como
#    compatibles —y hace bien, es la regla de siempre para el calendario—, así
#    que un auto que se devuelve a las 10:00 figuraba libre para entregar a las
#    10:00. El sitio lo vendía sin un minuto para prepararlo, y el problema
#    aparecía en el mostrador con el cliente parado enfrente.
# 2. **Lo que se perdía por nada.** Con la preparación contada, ese mismo auto
#    pedido a las 08:00 da "sin disponibilidad" — cuando en realidad **está**,
#    sólo que a partir de las 12:00. En una flota donde varias categorías
#    tienen una sola unidad, ese es el caso más común, no el raro.
#
# La preparación se modela como parte de la ocupación (`con_preparacion`), no
# como un caso especial del que ofrece la ventana: así el cupo que se muestra,
# el que valida el hold y el que decide la propuesta son **el mismo número**.
# Si la ventana lo tuviera en cuenta y el cupo no, el sitio ofrecería un
# horario que después el hold rechaza.
#
# Condiciones de la propuesta, las tres necesarias:
#
# 1. **Sólo si no queda ninguna unidad libre.** Si hay cupo se alquila normal,
#    a la hora que el cliente pidió. Correrle el horario a alguien que podía
#    retirar a las 8 sería empeorarle la reserva por nada.
# 2. **Sólo si la unidad vuelve ese mismo día.** Mover el retiro al día
#    siguiente no es la misma reserva: son días distintos y otro precio.
# 3. **Sólo reservas.** Un bloqueo que termina es un auto que sale del taller
#    —ya viene revisado— y un hold que vence es un cupo que se libera solo, sin
#    auto que preparar. Además los bloqueos terminan a medianoche, así que
#    sumarles el margen ofrecería una entrega a las 02:00.

MARGEN_ROTACION_HORAS = 2
REDONDEO_ENTREGA_MINUTOS = 30


def con_preparacion(
    ocupaciones: list[OcupacionCategoria],
    margen_horas: float = MARGEN_ROTACION_HORAS,
) -> list[OcupacionCategoria]:
    """
    Las mismas ocupaciones, con la preparación de cada auto que vuelve incluida.

    Una reserva que termina a las 10:00 deja el auto ocupado hasta las 12:00:
    no es que el cliente lo tenga, es que el auto no está en condiciones de
    salir. Para el cupo son lo mismo, y por eso conviene que sean una sola
    cosa.

    Sólo se estiran las reservas — ver la condición 3 de arriba.
    """
    if margen_horas <= 0:
        return ocupaciones
    margen = timedelta(hours=margen_horas)
    return [
        OcupacionCategoria(
            inicio=o.inicio,
            fin=o.fin + margen,
            categoria_id=o.categoria_id,
            vehiculo_id=o.vehiculo_id,
            origen=o.origen,
        )
        if o.origen == "reserva" else o
        for o in ocupaciones
    ]


@dataclass(frozen=True)
class EntregaPorRotacion:
    """
    Una entrega más tarde que la pedida, sobre una unidad que vuelve ese día.

    `devolucion_unidad` viaja para poder **decirle al cliente por qué**: "el
    auto se devuelve a las 10:00, lo preparamos y te lo entregamos 12:00" se
    acepta; un horario corrido sin explicación se lee como un error del sitio.
    """
    entrega: datetime
    devolucion_unidad: datetime
    margen_horas: float


def _redondear_arriba(momento: datetime, minutos: int) -> datetime:
    """
    Al siguiente múltiplo de `minutos`. Un mostrador no cita a las 12:07.
    """
    if minutos <= 0:
        return momento
    momento = momento.replace(second=0, microsecond=0)
    resto = (momento.minute % minutos)
    if resto == 0:
        return momento
    return momento + timedelta(minutes=minutos - resto)


def proponer_entrega_por_rotacion(
    categoria_id: int,
    inicio: datetime,
    fin: datetime,
    vehiculos: list[VehiculoDisponible],
    ocupaciones: list[OcupacionCategoria],
    margen_horas: float = MARGEN_ROTACION_HORAS,
    redondeo_minutos: int = REDONDEO_ENTREGA_MINUTOS,
) -> EntregaPorRotacion | None:
    """
    ¿Se puede cumplir este alquiler entregando más tarde el mismo día?

    Devuelve `None` cuando no corresponde ofrecerlo — que es la mayoría de las
    veces, y a propósito.

    **La disponibilidad de la ventana propuesta la decide `calcular_cupo`, no
    una cuenta paralela.** Se prueba cada horario candidato contra el mismo
    motor que responde el resto del sitio: si acá se dedujera "el auto vuelve a
    las 10, entonces a las 12 está libre", se estaría ignorando que esa misma
    unidad puede tener otra reserva encima a las 14 — y se prometería un auto
    que no está.

    Ojo con una asimetría necesaria: el cupo se mide contra las ocupaciones
    **con la preparación adentro**, pero el candidato es la devolución **real**.
    Es lo que permite que "pide 10:00 y el auto vuelve 10:00" ofrezca las 12:00
    en vez de no ofrecer nada: para el cupo el auto está ocupado hasta las
    12:00, y para el cliente el motivo es que vuelve a las 10:00.
    """
    preparadas = con_preparacion(ocupaciones, margen_horas)

    # Condición 1: si hay cupo, no hay nada que ofrecer. Se alquila normal.
    if calcular_cupo(categoria_id, inicio, fin, vehiculos, preparadas).hay_cupo:
        return None

    ids_categoria = {v.id for v in vehiculos if v.categoria_id == categoria_id}
    margen = timedelta(hours=margen_horas)

    candidatas: list[datetime] = []
    for o in ocupaciones:
        # Condición 3: sólo un auto que un cliente devuelve.
        if o.origen != "reserva":
            continue
        # Que la ocupación sea de esta categoría: con vehículo asignado, que el
        # auto lo sea; sin asignar, que la reserva lo sea.
        if o.vehiculo_id is not None:
            if o.vehiculo_id not in ids_categoria:
                continue
        elif o.categoria_id != categoria_id:
            continue
        # Condición 2: vuelve ese mismo día. Y que sea **esta** unidad la que
        # traba el retiro: si ya estuviera lista y limpia a la hora pedida, no
        # es la que hay que esperar.
        if o.fin + margen <= inicio or o.fin.date() != inicio.date():
            continue
        candidatas.append(o.fin)

    for devolucion in sorted(set(candidatas)):
        entrega = _redondear_arriba(devolucion + margen, redondeo_minutos)
        # El margen no puede empujar la entrega al día siguiente ni pasarse de
        # la devolución del propio cliente.
        if entrega.date() != inicio.date() or entrega >= fin:
            continue
        if calcular_cupo(categoria_id, entrega, fin, vehiculos, preparadas).hay_cupo:
            return EntregaPorRotacion(
                entrega=entrega,
                devolucion_unidad=devolucion,
                margen_horas=margen_horas,
            )
    return None


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
