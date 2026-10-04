"""Contrato de Uber: las cuentas que salen del valor de la semana."""
from datetime import date
from decimal import Decimal

from app.domain import uber


class TestSemanasYTotal:
    def test_semanas_completas(self):
        assert uber.cantidad_de_semanas(7) == 1
        assert uber.cantidad_de_semanas(28) == 4

    def test_una_semana_empezada_cuenta(self):
        assert uber.cantidad_de_semanas(8) == 2
        assert uber.cantidad_de_semanas(1) == 1

    def test_el_total_de_semanas_completas_es_exacto(self):
        assert uber.total_del_alquiler("200000", 28) == Decimal("800000.00")

    def test_el_total_se_prorratea_no_se_redondea_a_la_semana(self):
        assert uber.total_del_alquiler("210000", 10) == Decimal("300000.00")


class TestFechasDePago:
    def test_una_por_semana_desde_el_retiro(self):
        assert uber.fechas_de_pago(date(2026, 10, 5), 21) == [
            date(2026, 10, 5), date(2026, 10, 12), date(2026, 10, 19),
        ]

    def test_un_alquiler_corto_tiene_una_sola(self):
        assert uber.fechas_de_pago(date(2026, 10, 5), 3) == [date(2026, 10, 5)]


class TestCuotas:
    def test_la_suma_da_siempre_el_total(self):
        cuotas = uber.repartir_en_cuotas("100000", 3)
        assert sum(cuotas) == Decimal("100000")
        assert len(cuotas) == 3

    def test_el_resto_va_a_la_ultima(self):
        cuotas = uber.repartir_en_cuotas("100", 3)
        assert cuotas == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]


class TestKilometraje:
    def test_dentro_del_tope_no_se_cobra(self):
        assert uber.cargo_por_km_extra(1000, 1500, 100, 7) == Decimal("0")

    def test_pasado_del_tope_se_cobra_el_exceso(self):
        # 1.800 recorridos, 1.500 por semana, 7 días → 300 de más a $100.
        assert uber.cargo_por_km_extra(1800, 1500, 100, 7) == Decimal("30000.00")

    def test_el_tope_se_prorratea_por_dias(self):
        # 14 días → 3.000 permitidos.
        assert uber.km_permitidos(1500, 14) == Decimal("3000.00")
        assert uber.cargo_por_km_extra(3000, 1500, 100, 14) == Decimal("0.00")

    def test_sin_tope_o_sin_precio_no_cobra_nada(self):
        assert uber.cargo_por_km_extra(9999, None, 100, 7) == Decimal("0")
        assert uber.cargo_por_km_extra(9999, 1500, None, 7) == Decimal("0")
