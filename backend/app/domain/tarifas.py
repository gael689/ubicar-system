from __future__ import annotations
"""
Lógica pura de tarifas y duración.
Sin dependencias externas — testeable de forma aislada.

Decisiones de diseño (D1):
- La duración se calcula en días enteros (ignorando horas).
- La selección de tarifa usa: diaria (<7d), semanal (7-29d), mensual (≥30d).
- Si hay tarifa específica del vehículo → prioridad sobre la general.
- Si hay múltiples activas del mismo tipo → la de mayor id (la más reciente).
"""
import math
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.domain.enums import TipoTarifa
from app.core.exceptions import BusinessRuleError


@dataclass(frozen=True)
class TarifaInfo:
    id: int
    tipo: TipoTarifa
    monto: Decimal
    vehiculo_id: int | None  # None = tarifa general


def calcular_duracion_dias(fecha_inicio: date, fecha_fin: date) -> int:
    """
    Calcula la duración en días enteros (ignora horas).
    Ejemplo: 21/05 → 23/05 = 2 días.
    """
    return (fecha_fin - fecha_inicio).days


def seleccionar_tipo_tarifa(dias: int) -> TipoTarifa:
    """
    Determina el tipo de tarifa según la duración.
    - < 7 días  → diaria
    - 7..29 días → semanal
    - ≥ 30 días  → mensual
    """
    if dias < 7:
        return TipoTarifa.DIARIA
    elif dias < 30:
        return TipoTarifa.SEMANAL
    else:
        return TipoTarifa.MENSUAL


def seleccionar_tarifa(
    duracion_dias: int,
    tarifas: list[TarifaInfo],
) -> TarifaInfo:
    """
    Selecciona la tarifa aplicable para un alquiler.

    Prioridad:
    1. Tarifa específica del vehículo del tipo correspondiente (mayor id si hay varias).
    2. Tarifa general del tipo correspondiente (mayor id si hay varias).
    3. BusinessRuleError si no hay tarifa configurada.

    Args:
        duracion_dias: duración del alquiler en días.
        tarifas: todas las tarifas activas relevantes (del vehículo + generales).
    """
    tipo = seleccionar_tipo_tarifa(duracion_dias)

    # Tarifa específica del vehículo (vehiculo_id != None)
    especificas = [t for t in tarifas if t.vehiculo_id is not None and t.tipo == tipo]
    if especificas:
        return max(especificas, key=lambda t: t.id)

    # Tarifa general
    generales = [t for t in tarifas if t.vehiculo_id is None and t.tipo == tipo]
    if generales:
        return max(generales, key=lambda t: t.id)

    raise BusinessRuleError(
        "tarifa_no_encontrada",
        f"No hay tarifa activa de tipo '{tipo.value}' para una duración de {duracion_dias} días",
    )


def calcular_precio_total(duracion_dias: int, tarifa: TarifaInfo) -> Decimal:
    """Calcula el precio total del alquiler: días × monto de la tarifa."""
    return Decimal(str(duracion_dias)) * tarifa.monto
