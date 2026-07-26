"""
Tests del dominio: tarifas y duración.
Cobertura: selección de tipo, selección de tarifa con prioridades,
calcular_duracion_dias, BusinessRuleError cuando no hay tarifa.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.domain.tarifas import (
    calcular_duracion_dias,
    seleccionar_tipo_tarifa,
    seleccionar_tarifa,
    calcular_precio_total,
    TarifaInfo,
)
from app.domain.enums import TipoTarifa
from app.core.exceptions import BusinessRuleError


# ─── calcular_duracion_dias ───────────────────────────────────────────────────

class TestCalcularDuracionDias:
    def test_dos_dias(self):
        assert calcular_duracion_dias(date(2026, 5, 21), date(2026, 5, 23)) == 2

    def test_mismo_dia_es_cero(self):
        assert calcular_duracion_dias(date(2026, 5, 21), date(2026, 5, 21)) == 0

    def test_siete_dias(self):
        assert calcular_duracion_dias(date(2026, 5, 21), date(2026, 5, 28)) == 7

    def test_treinta_dias(self):
        assert calcular_duracion_dias(date(2026, 5, 1), date(2026, 5, 31)) == 30


# ─── seleccionar_tipo_tarifa ──────────────────────────────────────────────────

class TestSeleccionarTipoTarifa:
    def test_un_dia_es_diaria(self):
        assert seleccionar_tipo_tarifa(1) == TipoTarifa.DIARIA

    def test_seis_dias_es_diaria(self):
        assert seleccionar_tipo_tarifa(6) == TipoTarifa.DIARIA

    def test_siete_dias_es_semanal(self):
        assert seleccionar_tipo_tarifa(7) == TipoTarifa.SEMANAL

    def test_veintinueve_dias_es_semanal(self):
        assert seleccionar_tipo_tarifa(29) == TipoTarifa.SEMANAL

    def test_treinta_dias_es_mensual(self):
        assert seleccionar_tipo_tarifa(30) == TipoTarifa.MENSUAL

    def test_noventa_dias_es_mensual(self):
        assert seleccionar_tipo_tarifa(90) == TipoTarifa.MENSUAL


# ─── seleccionar_tarifa ───────────────────────────────────────────────────────

def tarifa(
    id: int, tipo: TipoTarifa, monto: float,
    vehiculo_id: int | None = None, categoria_id: int | None = None,
) -> TarifaInfo:
    return TarifaInfo(id=id, tipo=tipo, monto=Decimal(str(monto)), vehiculo_id=vehiculo_id, categoria_id=categoria_id)


class TestSeleccionarTarifa:
    def test_diaria_con_tarifa_general(self):
        tarifas = [tarifa(1, TipoTarifa.DIARIA, 30000)]
        t = seleccionar_tarifa(3, tarifas)
        assert t.tipo == TipoTarifa.DIARIA
        assert t.monto == Decimal("30000")

    def test_semanal_con_tarifa_general(self):
        tarifas = [tarifa(1, TipoTarifa.SEMANAL, 25000)]
        t = seleccionar_tarifa(7, tarifas)
        assert t.tipo == TipoTarifa.SEMANAL

    def test_mensual_con_tarifa_general(self):
        tarifas = [tarifa(1, TipoTarifa.MENSUAL, 20000)]
        t = seleccionar_tarifa(30, tarifas)
        assert t.tipo == TipoTarifa.MENSUAL

    def test_especifica_del_vehiculo_tiene_prioridad(self):
        """Tarifa específica del vehículo supera a la general."""
        tarifas = [
            tarifa(1, TipoTarifa.DIARIA, 30000, vehiculo_id=None),    # general
            tarifa(2, TipoTarifa.DIARIA, 35000, vehiculo_id=5),        # específica
        ]
        t = seleccionar_tarifa(3, tarifas)
        assert t.vehiculo_id == 5
        assert t.monto == Decimal("35000")

    def test_varias_activas_misma_banda_toma_la_mas_reciente(self):
        """Si hay varias generales del mismo tipo → toma la de mayor id."""
        tarifas = [
            tarifa(1, TipoTarifa.DIARIA, 25000, vehiculo_id=None),
            tarifa(5, TipoTarifa.DIARIA, 30000, vehiculo_id=None),
        ]
        t = seleccionar_tarifa(3, tarifas)
        assert t.id == 5
        assert t.monto == Decimal("30000")

    def test_sin_tarifa_lanza_business_rule_error(self):
        """Lista vacía o sin el tipo → BusinessRuleError."""
        with pytest.raises(BusinessRuleError):
            seleccionar_tarifa(3, [])

    def test_sin_tarifa_del_tipo_correcto(self):
        """Hay tarifa semanal pero se piden 3 días → error."""
        tarifas = [tarifa(1, TipoTarifa.SEMANAL, 25000)]
        with pytest.raises(BusinessRuleError):
            seleccionar_tarifa(3, tarifas)

    # ── D-08: tarifa por categoría ────────────────────────────────────────

    def test_tarifa_de_categoria_cuando_no_hay_especifica(self):
        tarifas = [
            tarifa(1, TipoTarifa.DIARIA, 20000, categoria_id=None),  # general
            tarifa(2, TipoTarifa.DIARIA, 28000, categoria_id=7),      # SUV
        ]
        t = seleccionar_tarifa(3, tarifas, categoria_id=7)
        assert t.id == 2
        assert t.monto == Decimal("28000")

    def test_especifica_del_vehiculo_le_gana_a_la_de_categoria(self):
        tarifas = [
            tarifa(1, TipoTarifa.DIARIA, 28000, categoria_id=7),
            tarifa(2, TipoTarifa.DIARIA, 35000, vehiculo_id=5),
        ]
        t = seleccionar_tarifa(3, tarifas, categoria_id=7)
        assert t.id == 2
        assert t.monto == Decimal("35000")

    def test_categoria_distinta_no_aplica(self):
        """Tarifa de categoría 7 no debe usarse para un vehículo de categoría 9."""
        tarifas = [tarifa(1, TipoTarifa.DIARIA, 28000, categoria_id=7)]
        with pytest.raises(BusinessRuleError):
            seleccionar_tarifa(3, tarifas, categoria_id=9)

    def test_sin_categoria_asignada_cae_a_general(self):
        """Vehículo sin categoria_id (categoria_id=None acá) usa la general, no la de categoría."""
        tarifas = [
            tarifa(1, TipoTarifa.DIARIA, 20000, categoria_id=None),
            tarifa(2, TipoTarifa.DIARIA, 28000, categoria_id=7),
        ]
        t = seleccionar_tarifa(3, tarifas, categoria_id=None)
        assert t.id == 1
        assert t.monto == Decimal("20000")


# ─── calcular_precio_total ────────────────────────────────────────────────────

class TestCalcularPrecioTotal:
    def test_tres_dias_tarifa_diaria(self):
        t = tarifa(1, TipoTarifa.DIARIA, 30000)
        assert calcular_precio_total(3, t) == Decimal("90000")

    def test_siete_dias_tarifa_semanal(self):
        t = tarifa(1, TipoTarifa.SEMANAL, 25000)
        assert calcular_precio_total(7, t) == Decimal("175000")

    def test_no_prorratea_semanal_diez_dias(self):
        """PRE-01: monto es precio POR DÍA, sin prorrateo — 10 días de tarifa
        semanal a $25.000/día son $250.000, no "una semana + 3 días sueltos"."""
        t = tarifa(1, TipoTarifa.SEMANAL, 25000)
        assert calcular_precio_total(10, t) == Decimal("250000")

    def test_no_prorratea_mensual_cuarenta_dias(self):
        t = tarifa(1, TipoTarifa.MENSUAL, 18000)
        assert calcular_precio_total(40, t) == Decimal("720000")
