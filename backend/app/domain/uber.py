"""
Contrato de Uber: valor por semana, pagos semanales y kilometraje (04/10/2026).

Pedido de Franco (01/10): *"Valor Semana · Condición de pago · Fechas de pago ·
Kilometraje (los km permitidos) · Precio del km extra. Lo de la franquicia queda
igual."* Y sobre el valor: *"es valor semana o valor total del alquiler y
seleccionar los pagos semanales — creo que para mí es mejor como te lo pasé,
entonces queda todo registrado."*

Por eso el dato que se carga es **el valor de la semana**, y todo lo demás
sale de ahí. Son funciones puras: no tocan la base y se prueban solas.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

DIAS_POR_SEMANA = 7
_CENTAVOS = Decimal("0.01")


def _dec(v) -> Decimal:
    return Decimal(str(v))


def cantidad_de_semanas(dias: int) -> int:
    """Cuántas semanas (enteras o empezadas) cubre un alquiler. Mínimo 1."""
    return max(1, math.ceil(max(dias, 1) / DIAS_POR_SEMANA))


def total_del_alquiler(valor_semana, dias: int) -> Decimal:
    """
    `valor_semana × días / 7`.

    Prorrateado y no redondeado a la semana siguiente: un alquiler de 10 días
    no cuesta dos semanas enteras. Con semanas completas da exactamente el
    valor de la semana por la cantidad.
    """
    return (_dec(valor_semana) * max(dias, 1) / DIAS_POR_SEMANA).quantize(
        _CENTAVOS, rounding=ROUND_HALF_UP
    )


def fechas_de_pago(fecha_inicio: date, dias: int) -> list[date]:
    """
    Una fecha por semana, **empezando el día del retiro** (se paga la semana
    por adelantado). Es sólo la propuesta: el operador las edita.
    """
    return [fecha_inicio + timedelta(days=DIAS_POR_SEMANA * i) for i in range(cantidad_de_semanas(dias))]


def repartir_en_cuotas(total, cantidad: int) -> list[Decimal]:
    """
    El total en `cantidad` cuotas iguales; **el resto de los centavos va a la
    última**, así la suma da siempre el total exacto.
    """
    cantidad = max(cantidad, 1)
    total = _dec(total)
    base = (total / cantidad).quantize(_CENTAVOS, rounding=ROUND_HALF_UP)
    cuotas = [base] * (cantidad - 1)
    cuotas.append(total - base * (cantidad - 1))
    return cuotas


def km_permitidos(km_semana, dias: int) -> Decimal:
    """Los km incluidos en el alquiler: `km por semana × días / 7`."""
    return (_dec(km_semana) * max(dias, 1) / DIAS_POR_SEMANA).quantize(_CENTAVOS)


def km_excedidos(km_recorridos, km_semana, dias: int) -> Decimal:
    """Los km que pasan del tope. Nunca negativo."""
    exceso = _dec(km_recorridos) - km_permitidos(km_semana, dias)
    return exceso if exceso > 0 else Decimal("0")


def cargo_por_km_extra(km_recorridos, km_semana, precio_km_extra, dias: int) -> Decimal:
    """Lo que se cobra por pasarse del kilometraje. 0 si falta algún dato."""
    if not km_semana or not precio_km_extra:
        return Decimal("0")
    return (km_excedidos(km_recorridos, km_semana, dias) * _dec(precio_km_extra)).quantize(
        _CENTAVOS, rounding=ROUND_HALF_UP
    )
