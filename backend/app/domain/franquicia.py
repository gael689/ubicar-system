"""
Cuánta plata pone el cliente si rompe el auto.

**La franquicia no es un número de la cobertura: es un número de la operación.**
Sale de la base de la categoría menos lo que descuenta cada cobertura
contratada. Hasta la migración 084 se guardaba el resultado ya calculado en el
adicional, lo que sólo podía ser cierto para una categoría — y había seis, con
tres bases distintas.

Lógica pura, sin base de datos: la usan el flujo web, el contrato y el
mostrador, y los tres tienen que dar el mismo número.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Iterable

# **La franquicia nunca es cero.** Es una decisión del negocio, no un detalle
# de implementación: una cobertura que deja al cliente sin ninguna
# responsabilidad cambia por completo el incentivo de cuidar el auto, y no es
# lo que se vende. Si la suma de descuentos llegara a la base, se corta acá.
#
# El piso es el propio tope: `franquicia_resultante` no deja bajar de este
# valor, y `puede_bajar_hasta` avisa antes, en la pantalla de carga, para que
# el caso no llegue a producirse en silencio.
FRANQUICIA_MINIMA = Decimal("500000")


def franquicia_resultante(
    base: Decimal | None,
    descuentos: Iterable[Decimal | None],
) -> Decimal | None:
    """
    La franquicia que efectivamente queda a cargo del cliente.

    `None` si la categoría no tiene base cargada: ahí no se puede afirmar nada
    y el contrato directamente no imprime franquicia (D-53). Un cero sería una
    afirmación, y sería falsa.

    **Las coberturas son escalones excluyentes, no se acumulan.** El cliente
    elige una: el paso 2 del flujo web dice *"Elegí una"* y `elegirCobertura`
    borra las demás antes de poner la elegida. Por eso acá manda **el descuento
    más grande** y no la suma.

    Que reciba una lista y no un solo valor es a propósito: el llamador pasa lo
    que haya contratado sin tener que saber que sólo puede haber una, y si
    algún día un dato mal cargado deja dos, esto devuelve la franquicia **más
    alta de las dos posibles** en vez de regalar la suma de los dos descuentos.
    Ante datos inconsistentes, la respuesta prudente es la que no le promete de
    más al cliente.

    Los dos escalones, sobre una base de $1.500.000:

        sin cobertura        base            $1.500.000
        reducida  (+10%)     −  $500.000     $1.000.000
        total     (+30%)     −$1.000.000     $  500.000

    El porcentaje es sobre el **precio del alquiler por día** y lo resuelve
    `PrecioService` contra `subtotal_vehiculo`; acá sólo se calcula la
    franquicia, que es otra cosa.
    """
    if base is None:
        return None

    mayor = Decimal("0")
    for d in descuentos:
        if d is not None:
            mayor = max(mayor, Decimal(str(d)))

    return max(Decimal(str(base)) - mayor, FRANQUICIA_MINIMA)


def puede_bajar_hasta(base: Decimal | None, descuentos: Iterable[Decimal | None]) -> Decimal | None:
    """
    Hasta dónde bajaría la franquicia con el escalón más grande, **sin el piso**.

    Existe para poder avisar en la pantalla de carga: si esto da por debajo de
    `FRANQUICIA_MINIMA`, alguien cargó una cobertura que esa categoría no
    soporta y el piso la está tapando. El número se ve bien y la tabla está mal.
    """
    if base is None:
        return None
    mayor = Decimal("0")
    for d in descuentos:
        if d is not None:
            mayor = max(mayor, Decimal(str(d)))
    return Decimal(str(base)) - mayor
