from __future__ import annotations
"""
Lógica pura del cálculo de excedente (Control de 24hs).
Sin dependencias externas — testeable de forma aislada.

Decisiones de diseño (D6):
- Período de gracia: 40 minutos (GRACIA_MINUTOS).
- Pasada la gracia: se cobra por hora COMPLETA redondeando PARA ABAJO (floor).
  Ejemplo: 5h 03min de excedente neto → 5 horas cobradas.
- Tope a 12 horas: a partir de 12h de excedente neto → se cobra por día completo.
  Fórmula: ceil(horas / 24) × tarifa_diaria.
- tarifa_hora_excedente = 3 × (tarifa_diaria / 24)  ← multiplicador confirmado.

Punto de referencia (D1):
  excedente_empieza_desde = hora_devolucion_acordada (no hora_checkout)
  Si no hay late checkout → hora_devolucion_acordada == hora_inicio del checkout.
"""
import math
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

# ─── Constantes del módulo (D6.1) ────────────────────────────────────────────
GRACIA_MINUTOS: int = 40
MULTIPLICADOR_HORA_EXCEDENTE: int = 3
TOPE_HORAS_ANTES_DIA_EXTRA: int = 12


@dataclass(frozen=True)
class ResultadoExcedente:
    minutos_excedidos_brutos: int     # minutos reales después de hora_devolucion_acordada
    horas_excedidas: int              # floor(minutos_netos / 60) — post gracia, redondeado abajo
    tarifa_diaria: Decimal
    tarifa_hora_excedente: Decimal    # 3 × (tarifa_diaria / 24)
    cargo_sugerido: Decimal           # monto a cobrar según reglas D6
    aplica_dia_completo: bool         # True si horas_excedidas >= TOPE_HORAS_ANTES_DIA_EXTRA
    dias_completos_cobrados: int      # ceil(horas_excedidas / 24) si aplica_dia_completo, else 0
    dentro_de_gracia: bool            # True si el cliente llegó antes o dentro del margen


def calcular_excedente(
    hora_devolucion_acordada: datetime,
    fecha_fin_real: datetime,
    tarifa_diaria: Decimal,
    gracia_minutos: int = GRACIA_MINUTOS,
    multiplicador_hora: int = MULTIPLICADOR_HORA_EXCEDENTE,
    tope_horas: int = TOPE_HORAS_ANTES_DIA_EXTRA,
) -> ResultadoExcedente:
    """
    Calcula el excedente de tiempo y el cargo correspondiente.

    Args:
        hora_devolucion_acordada: datetime de devolución esperada
            (= fecha_fin + hora_devolucion_acordada de la reserva; D1).
        fecha_fin_real: datetime en que el cliente efectivamente devolvió el vehículo (checkin).
        tarifa_diaria: precio por día del alquiler.
        gracia_minutos: minutos de gracia sin cargo (default 40).
        multiplicador_hora: multiplicador sobre tarifa/hora para excedente (default 3).
        tope_horas: horas de excedente a partir de las cuales se cobra día completo (default 12).

    Returns:
        ResultadoExcedente con todos los datos del cálculo.
    """
    tarifa_hora_excedente = multiplicador_hora * (tarifa_diaria / Decimal("24"))

    diferencia_total = fecha_fin_real - hora_devolucion_acordada
    minutos_brutos = int(diferencia_total.total_seconds() / 60)

    # Si devolvió antes o dentro del período de gracia → sin cargo
    if minutos_brutos <= gracia_minutos:
        return ResultadoExcedente(
            minutos_excedidos_brutos=max(minutos_brutos, 0),
            horas_excedidas=0,
            tarifa_diaria=tarifa_diaria,
            tarifa_hora_excedente=tarifa_hora_excedente,
            cargo_sugerido=Decimal("0"),
            aplica_dia_completo=False,
            dias_completos_cobrados=0,
            dentro_de_gracia=True,
        )

    minutos_netos = minutos_brutos - gracia_minutos
    horas_excedidas = minutos_netos // 60  # floor — no se cobran minutos sueltos

    if horas_excedidas < tope_horas:
        # Cobro por hora
        cargo = horas_excedidas * tarifa_hora_excedente
        return ResultadoExcedente(
            minutos_excedidos_brutos=minutos_brutos,
            horas_excedidas=horas_excedidas,
            tarifa_diaria=tarifa_diaria,
            tarifa_hora_excedente=tarifa_hora_excedente,
            cargo_sugerido=cargo,
            aplica_dia_completo=False,
            dias_completos_cobrados=0,
            dentro_de_gracia=False,
        )
    else:
        # Cobro por día completo
        dias = math.ceil(horas_excedidas / 24)
        cargo = dias * tarifa_diaria
        return ResultadoExcedente(
            minutos_excedidos_brutos=minutos_brutos,
            horas_excedidas=horas_excedidas,
            tarifa_diaria=tarifa_diaria,
            tarifa_hora_excedente=tarifa_hora_excedente,
            cargo_sugerido=cargo,
            aplica_dia_completo=True,
            dias_completos_cobrados=dias,
            dentro_de_gracia=False,
        )
