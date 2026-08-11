from __future__ import annotations
"""
Recargo por franja etaria (D-38) — lógica pura, sin base.

**No hay edad mínima: la edad modifica el precio, no rechaza al cliente.**

El recargo se aplica sobre el alquiler del vehículo, **después** del descuento
por duración y **fuera** de los adicionales. El orden importa:

    subtotal del vehículo
      − descuento por duración
      = subtotal_vehiculo
      + recargo por edad          ← acá
      + adicionales
      = total

Va después del descuento porque es un recargo por riesgo, no una tarifa: si se
aplicara antes, un descuento del 20% por alquiler largo también licuaría el
recargo, y el riesgo de un conductor de 19 años no baja porque alquile más
días. Y va aparte de los adicionales porque no es algo que el cliente elija.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

_CENTAVO = Decimal("0.01")


def _redondear(valor: Decimal) -> Decimal:
    return valor.quantize(_CENTAVO, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class RecargoEdadInfo:
    id: int
    nombre: str
    edad_desde: int
    edad_hasta: int | None
    monto: Decimal | None
    porcentaje: Decimal | None
    unidad_cobro: str  # por_dia | unico
    categoria_id: int | None


@dataclass(frozen=True)
class RecargoAplicado:
    id: int
    nombre: str
    edad: int
    monto: Decimal


def calcular_edad(fecha_nacimiento: date, referencia: date) -> int:
    """
    Edad cumplida a la fecha de referencia.

    **La referencia es el día en que retira el auto**, no hoy: alguien que
    cumple 25 la semana que viene y alquila el mes que viene ya no es un
    conductor joven, y cobrarle como tal sería cobrar de más.
    """
    edad = referencia.year - fecha_nacimiento.year
    if (referencia.month, referencia.day) < (fecha_nacimiento.month, fecha_nacimiento.day):
        edad -= 1
    return edad


def seleccionar_recargo(
    edad: int,
    recargos: list[RecargoEdadInfo],
    categoria_id: int | None = None,
) -> RecargoEdadInfo | None:
    """
    El recargo aplicable a una edad. `None` si ninguna franja la cubre — que
    es el caso normal para la mayoría de los conductores.

    Si más de una franja cubre la edad (rangos mal cargados que se solapan),
    gana **la de la categoría** por sobre la general, y a igualdad **la más
    específica** (la franja más angosta). Un solapamiento es un error de carga,
    pero resolverlo de forma determinista es mejor que elegir al azar: al menos
    el mismo cliente paga siempre lo mismo.
    """
    aplicables = [
        r for r in recargos
        if edad >= r.edad_desde
        and (r.edad_hasta is None or edad <= r.edad_hasta)
        and (r.categoria_id is None or r.categoria_id == categoria_id)
    ]
    if not aplicables:
        return None

    def _amplitud(r: RecargoEdadInfo) -> int:
        # Una franja sin tope es la más amplia posible.
        return 10_000 if r.edad_hasta is None else r.edad_hasta - r.edad_desde

    # De la categoría primero, después la franja más angosta, después el id
    # más alto (la cargada más recientemente).
    return min(
        aplicables,
        key=lambda r: (r.categoria_id is None, _amplitud(r), -r.id),
    )


def calcular_recargo(
    recargo: RecargoEdadInfo | None,
    edad: int,
    subtotal_vehiculo: Decimal,
    duracion_dias: int,
) -> RecargoAplicado | None:
    """
    Importe del recargo. `None` si no corresponde ninguno.

    - **porcentaje** → se calcula sobre `subtotal_vehiculo`, que ya es el
      total del auto por todo el alquiler. Por eso no se multiplica por los
      días aunque la unidad sea `por_dia`: el porcentaje ya escala con la
      duración. Multiplicarlo otra vez lo cobraría al cuadrado.
    - **monto fijo** → se multiplica por los días si la unidad es `por_dia`.
    """
    if recargo is None:
        return None

    if recargo.porcentaje is not None:
        importe = subtotal_vehiculo * Decimal(str(recargo.porcentaje)) / Decimal("100")
    else:
        importe = Decimal(str(recargo.monto or 0))
        if recargo.unidad_cobro == "por_dia":
            importe *= Decimal(duracion_dias)

    importe = _redondear(importe)
    if importe <= 0:
        return None

    return RecargoAplicado(
        id=recargo.id, nombre=recargo.nombre, edad=edad, monto=importe
    )


def vista_con_recargo_incluido(
    precio_dia_promedio: Decimal,
    total_referencia: Decimal | None,
    recargo: RecargoAplicado | None,
    duracion_dias: int,
) -> tuple[Decimal, Decimal | None]:
    """
    Reparte el recargo en los otros dos números que muestra la web.

    `Cotizacion.total` ya lo trae adentro, pero `precio_dia_promedio` se
    calcula sobre `subtotal_vehiculo` —o sea, antes del recargo— y
    `total_referencia` es el precio de lista. Si se los deja crudos pasan dos
    cosas, las dos malas:

    - la tarjeta muestra un total y un "por día" que no se corresponden, y
      cualquiera que multiplique encuentra la diferencia;
    - el tachado del "antes $X" puede quedar **por debajo** del precio
      vigente, que es exactamente lo contrario de lo que una promo comunica.

    O el recargo entra en los tres números o no entra en ninguno.
    """
    if recargo is None:
        return precio_dia_promedio, total_referencia

    dias = duracion_dias or 1
    promedio = _redondear(precio_dia_promedio + recargo.monto / Decimal(dias))
    referencia = (
        _redondear(total_referencia + recargo.monto)
        if total_referencia is not None else None
    )
    return promedio, referencia
