from __future__ import annotations
"""
Lógica pura del ledger de cuenta corriente.
Sin dependencias externas — testeable de forma aislada.

Convención de signos (D-01, docs/DECISIONES.md):
- Saldo positivo = el cliente debe.
- tipo='debito' aumenta la deuda (+monto).
- tipo='credito' la reduce (-monto).
"""
from datetime import date, timedelta
from decimal import Decimal

DIAS_POR_CONDICION: dict[str, int] = {
    "contado": 0,
    "cta_cte_15": 15,
    "cta_cte_30": 30,
    "cta_cte_60": 60,
    "cta_cte_90": 90,
}


def signo_movimiento(tipo: str) -> int:
    """+1 para débito (aumenta la deuda), -1 para crédito (la reduce)."""
    if tipo == "debito":
        return 1
    if tipo == "credito":
        return -1
    raise ValueError(f"tipo de movimiento inválido: {tipo!r}")


def aplicar_movimiento(saldo_actual: Decimal, tipo: str, monto: Decimal) -> Decimal:
    """Calcula el nuevo saldo tras aplicar un movimiento. No persiste nada."""
    return saldo_actual + signo_movimiento(tipo) * monto


def calcular_vencimiento(fecha: date, condicion: str | None) -> date | None:
    """
    Calcula la fecha de vencimiento a partir de la condición de pago.

    Devuelve `None` **sólo** si no hay condición o si la condición no está en
    `DIAS_POR_CONDICION`. Con `contado` (0 días) devuelve **la misma fecha del
    movimiento**: contado vence hoy, y "hoy" es una fecha, no la ausencia de
    una.

    El docstring anterior decía lo contrario —"None si … es 'contado'"— y el
    código nunca hizo eso. Importa: quien lea el docstring en vez del cuerpo va
    a asumir que un débito al contado nace sin vencimiento, y toda la lógica de
    avisos de deuda (`notificaciones_reglas.cc_vencida` y
    `cc_vencimiento_proximo`) depende de que venza el mismo día. Ver
    `PLAN_DINERO.md` §1.1.
    """
    if not condicion or condicion not in DIAS_POR_CONDICION:
        return None
    dias = DIAS_POR_CONDICION[condicion]
    if dias == 0:
        return fecha
    return fecha + timedelta(days=dias)
