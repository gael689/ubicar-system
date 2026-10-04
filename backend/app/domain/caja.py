"""
La caja como la quiere Franco (planilla `Ubicar_Rent.xlsx`, 04/10/2026).

Una fila por alquiler con lo **facturado** y lo que va a **caja** (sin factura),
lo que se puede repartir entre los socios (*distribuible*) y, cada mes, quién le
pasa plata a quién para que cada uno haya cobrado lo que le corresponde.

Todo acá son funciones puras sobre números: no tocan la base y se prueban solas.
Las dos reglas de plata que importan, tal cual la planilla:

- **Distribuible = Facturado / 1,25 + Caja.** El 1,25 queda como está: lo que
  se factura rinde menos que lo que entra en negro, y la planilla ya lo
  descuenta. No se reinterpreta.
- **La compensación es sobre el total cobrado**, no sobre el distribuible. Los
  gastos se ven aparte y no entran en esta cuenta.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

COEFICIENTE_FACTURADO = Decimal("1.25")
_CENTAVOS = Decimal("0.01")


def _d(v) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def _redondear(v: Decimal) -> Decimal:
    return v.quantize(_CENTAVOS, rounding=ROUND_HALF_UP)


def facturado_de(total, monto_facturado, con_factura: bool) -> Decimal:
    """
    La parte del total que va con factura.

    Si la reserva declara un monto, es ese (nunca más que el total ni menos que
    cero). Si no —una reserva anterior a la factura parcial— es todo el total
    cuando `con_factura` y nada cuando no.
    """
    total = _d(total)
    if monto_facturado is not None:
        return max(Decimal("0"), min(_d(monto_facturado), total))
    return total if con_factura else Decimal("0")


def caja_de(total, facturado) -> Decimal:
    """Lo que no se factura: el total menos lo facturado."""
    return max(Decimal("0"), _d(total) - _d(facturado))


def distribuible(facturado, caja, coeficiente: Decimal = COEFICIENTE_FACTURADO) -> Decimal:
    """Facturado / 1,25 + Caja."""
    return _redondear(_d(facturado) / coeficiente + _d(caja))


def distribuible_de_cobro(monto, total, facturado, coeficiente: Decimal = COEFICIENTE_FACTURADO) -> Decimal:
    """
    El distribuible de **un cobro** de un alquiler: el cobro se reparte entre
    facturado y caja en la misma proporción que el total del alquiler.

    Sin total (un cobro suelto) no hay proporción: se toma como caja.
    """
    monto, total = _d(monto), _d(total)
    if total <= 0:
        return _redondear(monto)
    parte_facturada = _d(facturado) / total
    return _redondear(monto * (parte_facturada / coeficiente + (Decimal("1") - parte_facturada)))


@dataclass(frozen=True)
class Transferencia:
    de: int
    a: int
    monto: Decimal


@dataclass(frozen=True)
class Compensacion:
    total_cobrado: Decimal
    # Lo que cada socio tendría que haber cobrado, y lo que cobró de más (+) o de menos (−).
    corresponde: dict[int, Decimal]
    saldo: dict[int, Decimal]
    transferencias: list[Transferencia]


def compensar(cobrado_por: dict[int, Decimal], porcentajes: dict[int, Decimal]) -> Compensacion:
    """
    Quién le pasa cuánto a quién para que cada socio quede con su parte del
    **total cobrado**.

    `cobrado_por`: lo que cobró cada persona (un socio, o alguien que cobra sin
    ser socio: ese corresponde 0 y le pasa todo a los socios).
    `porcentajes`: el % de cada socio sobre el total; tiene que sumar 100.

    Con dos socios 50/50 da lo de la planilla: el que cobró más le pasa la
    diferencia dividida por dos.
    """
    if not porcentajes:
        raise ValueError("No hay socios con porcentaje.")
    if sum(_d(p) for p in porcentajes.values()) != Decimal("100"):
        raise ValueError("Los porcentajes de los socios tienen que sumar 100.")

    total = sum((_d(v) for v in cobrado_por.values()), Decimal("0"))
    corresponde = {i: _redondear(total * _d(p) / Decimal("100")) for i, p in porcentajes.items()}
    saldo: dict[int, Decimal] = {}
    for i in set(cobrado_por) | set(porcentajes):
        saldo[i] = _redondear(_d(cobrado_por.get(i)) - corresponde.get(i, Decimal("0")))

    # Los que cobraron de más (+) le pasan a los que cobraron de menos (−).
    deben = sorted(((i, s) for i, s in saldo.items() if s > 0), key=lambda x: -x[1])
    reciben = sorted(((i, -s) for i, s in saldo.items() if s < 0), key=lambda x: -x[1])
    transferencias: list[Transferencia] = []
    deben = [list(x) for x in deben]
    reciben = [list(x) for x in reciben]
    while deben and reciben:
        pago = min(deben[0][1], reciben[0][1])
        if pago > 0:
            transferencias.append(Transferencia(de=deben[0][0], a=reciben[0][0], monto=_redondear(pago)))
        deben[0][1] -= pago
        reciben[0][1] -= pago
        if deben[0][1] <= Decimal("0.005"):
            deben.pop(0)
        if reciben and reciben[0][1] <= Decimal("0.005"):
            reciben.pop(0)
    return Compensacion(total_cobrado=_redondear(total), corresponde=corresponde,
                        saldo=saldo, transferencias=transferencias)
