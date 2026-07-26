"""
Tests del dominio: ledger de cuenta corriente (D-01, signos y vencimientos).
"""
import pytest
from datetime import date
from decimal import Decimal

from app.domain.cuenta_corriente import (
    signo_movimiento,
    aplicar_movimiento,
    calcular_vencimiento,
)


class TestSignoMovimiento:
    def test_debito_es_positivo(self):
        assert signo_movimiento("debito") == 1

    def test_credito_es_negativo(self):
        assert signo_movimiento("credito") == -1

    def test_tipo_invalido_lanza_error(self):
        with pytest.raises(ValueError):
            signo_movimiento("otro")


class TestAplicarMovimiento:
    def test_debito_aumenta_el_saldo(self):
        nuevo = aplicar_movimiento(Decimal("100"), "debito", Decimal("50"))
        assert nuevo == Decimal("150")

    def test_credito_reduce_el_saldo(self):
        nuevo = aplicar_movimiento(Decimal("100"), "credito", Decimal("50"))
        assert nuevo == Decimal("50")

    def test_credito_puede_dejar_saldo_a_favor_negativo(self):
        nuevo = aplicar_movimiento(Decimal("30"), "credito", Decimal("50"))
        assert nuevo == Decimal("-20")


class TestCalcularVencimiento:
    def test_sin_condicion_no_hay_vencimiento(self):
        assert calcular_vencimiento(date(2026, 7, 26), None) is None

    def test_contado_vence_el_mismo_dia(self):
        assert calcular_vencimiento(date(2026, 7, 26), "contado") == date(2026, 7, 26)

    def test_cta_cte_30_suma_30_dias(self):
        assert calcular_vencimiento(date(2026, 7, 1), "cta_cte_30") == date(2026, 7, 31)

    def test_cta_cte_90_suma_90_dias(self):
        assert calcular_vencimiento(date(2026, 1, 1), "cta_cte_90") == date(2026, 4, 1)

    def test_condicion_desconocida_no_calcula(self):
        assert calcular_vencimiento(date(2026, 7, 26), "algo_raro") is None
