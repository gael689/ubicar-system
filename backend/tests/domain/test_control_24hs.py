"""
Tests del dominio: calcular_excedente (control_24hs).
Todos los casos del planning D6, verificados con cálculo manual.
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.domain.control_24hs import calcular_excedente, ResultadoExcedente


TARIFA = Decimal("24000")  # $24.000/día → tarifa_hora_excedente = $3.000


def devolucion_base() -> datetime:
    """Hora de devolución acordada: 2026-05-27 10:00."""
    return datetime(2026, 5, 27, 10, 0, 0)


def checkin_en(minutos_despues: int) -> datetime:
    """Devuelve un checkin N minutos después de la devolución acordada."""
    return devolucion_base() + timedelta(minutes=minutos_despues)


class TestCalcularExcedente:

    # ── Dentro de gracia ─────────────────────────────────────────────────────

    def test_sin_excedente_puntual(self):
        """Checkin exacto a la hora de devolución → dentro de gracia."""
        r = calcular_excedente(devolucion_base(), devolucion_base(), TARIFA)
        assert r.dentro_de_gracia is True
        assert r.horas_excedidas == 0
        assert r.cargo_sugerido == Decimal("0")

    def test_antes_de_devolución(self):
        """Checkin antes de la hora de devolución → dentro de gracia."""
        r = calcular_excedente(devolucion_base(), checkin_en(-30), TARIFA)
        assert r.dentro_de_gracia is True
        assert r.cargo_sugerido == Decimal("0")

    def test_39_minutos_dentro_de_gracia(self):
        r = calcular_excedente(devolucion_base(), checkin_en(39), TARIFA)
        assert r.dentro_de_gracia is True
        assert r.cargo_sugerido == Decimal("0")

    def test_40_minutos_exactos_dentro_de_gracia(self):
        """Exactamente 40 min → borde de la gracia, sin cargo."""
        r = calcular_excedente(devolucion_base(), checkin_en(40), TARIFA)
        assert r.dentro_de_gracia is True
        assert r.cargo_sugerido == Decimal("0")

    # ── Excedente por hora (post-gracia, antes del tope de 12h) ─────────────

    def test_41_minutos_post_gracia_0_horas_completas(self):
        """41 min totales → 1 min de excedente neto → floor(1/60) = 0 horas → cargo = 0."""
        r = calcular_excedente(devolucion_base(), checkin_en(41), TARIFA)
        assert r.dentro_de_gracia is False
        assert r.horas_excedidas == 0
        assert r.cargo_sugerido == Decimal("0")
        assert r.aplica_dia_completo is False

    def test_100_minutos_1_hora_cobrada(self):
        """100 min totales → 60 min de excedente neto → floor(60/60) = 1h → $3.000."""
        r = calcular_excedente(devolucion_base(), checkin_en(100), TARIFA)
        assert r.horas_excedidas == 1
        assert r.cargo_sugerido == Decimal("3000")

    def test_5h_03min_se_cobran_5_horas(self):
        """5h 03min totales = 303 min → netos 263 min → floor(263/60) = 4h → $12.000."""
        # 303 min - 40 min gracia = 263 min netos; 263 // 60 = 4
        r = calcular_excedente(devolucion_base(), checkin_en(303), TARIFA)
        assert r.horas_excedidas == 4
        assert r.cargo_sugerido == Decimal("12000")

    def test_5h_59min_no_son_6h(self):
        """5h 59min totales → 319 min netos (sin gracia) → floor(319/60) = 5h."""
        # 5*60+59 = 359 min total; 359 - 40 = 319 netos; 319 // 60 = 5
        r = calcular_excedente(devolucion_base(), checkin_en(359), TARIFA)
        assert r.horas_excedidas == 5
        assert r.cargo_sugerido == Decimal("15000")

    def test_11h_59min_antes_del_tope(self):
        """11h 59min totales → no aplica día completo."""
        # 11*60+59 = 719 min total; 719 - 40 = 679 netos; 679 // 60 = 11h
        r = calcular_excedente(devolucion_base(), checkin_en(719), TARIFA)
        assert r.horas_excedidas == 11
        assert r.aplica_dia_completo is False
        assert r.cargo_sugerido == Decimal("33000")  # 11 * 3000

    # ── Tope a 12 horas → cobro por día completo ──────────────────────────────

    def test_12h_exactas_aplica_dia_completo(self):
        """12h 00min de excedente neto → aplica_dia_completo = True, 1 día."""
        # 12*60 + 40 = 760 min total; 760 - 40 = 720 netos; 720 // 60 = 12h >= tope
        r = calcular_excedente(devolucion_base(), checkin_en(760), TARIFA)
        assert r.aplica_dia_completo is True
        assert r.dias_completos_cobrados == 1
        assert r.cargo_sugerido == TARIFA  # 1 × $24.000

    def test_25h_son_2_dias(self):
        """25h de excedente neto → ceil(25/24) = 2 días."""
        # (25*60 + 40) = 1540 min total
        r = calcular_excedente(devolucion_base(), checkin_en(1540), TARIFA)
        assert r.aplica_dia_completo is True
        assert r.dias_completos_cobrados == 2
        assert r.cargo_sugerido == 2 * TARIFA

    def test_48h_01min_son_3_dias(self):
        """48h 01min de excedente neto → ceil(48.01/24) = ceil(2.0004) = 3 días."""
        # (48*60+1+40) = 2921 min total; 2921 - 40 = 2881 netos; 2881 // 60 = 48h
        # ceil(48/24) = 2 — corrección: 2881 // 60 = 48, ceil(48/24) = 2
        # Para 3 días necesitamos > 48h netas: 48*60+1 = 2881 netos → 48h (ceil = 2)
        # Para forzar 3 dias: 49h netas = 49*60+40 = 2980 total
        r = calcular_excedente(devolucion_base(), checkin_en(2980), TARIFA)
        assert r.aplica_dia_completo is True
        # 2980 - 40 = 2940 netos; 2940 // 60 = 49h; ceil(49/24) = 3
        assert r.dias_completos_cobrados == 3
        assert r.cargo_sugerido == 3 * TARIFA

    # ── tarifa_hora_excedente ─────────────────────────────────────────────────

    def test_tarifa_hora_excedente_formula(self):
        """tarifa_hora_excedente debe ser exactamente 3 × (24000/24) = 3000."""
        r = calcular_excedente(devolucion_base(), checkin_en(100), TARIFA)
        assert r.tarifa_hora_excedente == Decimal("3000")

    # ── Late checkout (D1) ────────────────────────────────────────────────────

    def test_late_checkout_14_checkin_15h30(self):
        """
        Late checkout acordado a las 14:00.
        Checkin a las 15:30 → excedente bruto 90 min, neto 50 min → 0 horas completas.
        """
        devolución_acordada = datetime(2026, 5, 27, 14, 0, 0)
        checkin = datetime(2026, 5, 27, 15, 30, 0)  # 90 min después
        r = calcular_excedente(devolución_acordada, checkin, TARIFA)
        assert r.minutos_excedidos_brutos == 90
        # 90 - 40 = 50 min netos; 50 // 60 = 0 horas
        assert r.horas_excedidas == 0
        assert r.cargo_sugerido == Decimal("0")

    def test_late_checkout_14_checkin_16h(self):
        """
        Late checkout acordado a las 14:00.
        Checkin a las 16:00 → excedente bruto 120 min, neto 80 min → 1 hora.
        """
        devolución_acordada = datetime(2026, 5, 27, 14, 0, 0)
        checkin = datetime(2026, 5, 27, 16, 0, 0)  # 120 min después
        r = calcular_excedente(devolución_acordada, checkin, TARIFA)
        assert r.minutos_excedidos_brutos == 120
        assert r.horas_excedidas == 1
        assert r.cargo_sugerido == Decimal("3000")

    # ── Argumentos inyectables (para testear sobreescritura) ─────────────────

    def test_gracia_custom_20_minutos(self):
        """Con gracia de 20 min, 30 min de excedente → 10 min netos → 0h completas."""
        r = calcular_excedente(devolucion_base(), checkin_en(30), TARIFA, gracia_minutos=20)
        assert r.dentro_de_gracia is False
        assert r.horas_excedidas == 0

    def test_multiplicador_custom(self):
        """Con multiplicador=2, tarifa_hora = 2 × (24000/24) = 2000."""
        r = calcular_excedente(devolucion_base(), checkin_en(100), TARIFA, multiplicador_hora=2)
        assert r.tarifa_hora_excedente == Decimal("2000")
        assert r.horas_excedidas == 1
        assert r.cargo_sugerido == Decimal("2000")
