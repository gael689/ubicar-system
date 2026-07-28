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
    cotizar_por_bandas,
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


# ─── cotizar_por_bandas (D-35: prorrateo por bloques) ─────────────────────────

class TestSoloTarifaDiaria:
    """Con sólo tarifa diaria cargada —que es el estado real de la base— el
    precio tiene que dar exactamente lo mismo que antes de D-35. Es lo que
    permitió cambiar el modelo sin migrar ni una reserva."""

    def test_tres_dias(self):
        ts = [tarifa(1, TipoTarifa.DIARIA, 30000)]
        assert calcular_precio_total(3, ts) == Decimal("90000.00")

    def test_diez_dias_sin_semanal_son_diez_dias(self):
        ts = [tarifa(1, TipoTarifa.DIARIA, 30000)]
        assert calcular_precio_total(10, ts) == Decimal("300000.00")

    def test_cuarenta_dias_sin_semanal_ni_mensual(self):
        ts = [tarifa(1, TipoTarifa.DIARIA, 30000)]
        assert calcular_precio_total(40, ts) == Decimal("1200000.00")


class TestProrrateoPorBloques:
    def test_diez_dias_es_una_semana_mas_tres_dias(self):
        """El caso que define D-35: 10 días = 1 semana + 3 días sueltos."""
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 25000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
        ]
        cot = cotizar_por_bandas(10, ts)
        assert cot.total == Decimal("225000.00")  # 150.000 + 3 × 25.000
        assert [(b.tipo, b.cantidad) for b in cot.bloques] == [
            (TipoTarifa.SEMANAL, 1),
            (TipoTarifa.DIARIA, 3),
        ]

    def test_cuarenta_dias_es_mes_mas_semana_mas_tres_dias(self):
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 25000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
            tarifa(3, TipoTarifa.MENSUAL, 500000),
        ]
        cot = cotizar_por_bandas(40, ts)
        # 500.000 + 150.000 + 3 × 25.000
        assert cot.total == Decimal("725000.00")
        assert [(b.tipo, b.cantidad) for b in cot.bloques] == [
            (TipoTarifa.MENSUAL, 1),
            (TipoTarifa.SEMANAL, 1),
            (TipoTarifa.DIARIA, 3),
        ]

    def test_catorce_dias_son_dos_semanas_exactas(self):
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 25000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
        ]
        cot = cotizar_por_bandas(14, ts)
        assert cot.total == Decimal("300000.00")
        assert len(cot.bloques) == 1
        assert cot.bloques[0].cantidad == 2

    def test_seis_dias_no_se_optimiza_a_semana(self):
        """No busca el precio más barato: 6 días son 6 días, aunque la semana
        salga menos. Sugerirle al cliente que alquile más es una decisión
        comercial (D-35b), no del cálculo."""
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 30000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
        ]
        cot = cotizar_por_bandas(6, ts)
        assert cot.total == Decimal("180000.00")  # 6 × 30.000, no 150.000

    def test_sin_tarifa_diaria_los_dias_sueltos_fallan(self):
        """Cobrar de menos en silencio es peor que fallar."""
        ts = [tarifa(1, TipoTarifa.SEMANAL, 150000)]
        with pytest.raises(BusinessRuleError):
            cotizar_por_bandas(10, ts)

    def test_sin_ninguna_tarifa_falla(self):
        with pytest.raises(BusinessRuleError):
            cotizar_por_bandas(3, [])

    def test_duracion_cero_falla(self):
        ts = [tarifa(1, TipoTarifa.DIARIA, 30000)]
        with pytest.raises(BusinessRuleError):
            cotizar_por_bandas(0, ts)

    def test_tarifa_principal_es_la_del_bloque_mas_grande(self):
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 25000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
        ]
        cot = cotizar_por_bandas(10, ts)
        assert cot.tarifa_principal.id == 2

    def test_respeta_la_prioridad_del_vehiculo(self):
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 30000),
            tarifa(2, TipoTarifa.DIARIA, 20000, vehiculo_id=5),
        ]
        cot = cotizar_por_bandas(3, ts)
        assert cot.total == Decimal("60000.00")


class TestDesgloseDiario:
    """El desglose por día es lo que consume el motor de calendario. Tiene que
    tener un precio por día y sumar exactamente el total."""

    def test_hay_un_precio_por_cada_dia(self):
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 25000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
        ]
        cot = cotizar_por_bandas(10, ts)
        assert len(cot.precios_por_dia) == 10

    def test_la_suma_diaria_es_exactamente_el_total(self):
        """$150.000 / 7 no es exacto: sin repartir el resto, el desglose daría
        $149.999,99 y no coincidiría con lo que se cobra."""
        ts = [tarifa(1, TipoTarifa.SEMANAL, 150000)]
        cot = cotizar_por_bandas(7, ts)
        assert sum(cot.precios_por_dia) == cot.total == Decimal("150000.00")

    def test_los_dias_sueltos_valen_el_dia_completo(self):
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 25000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
        ]
        cot = cotizar_por_bandas(10, ts)
        assert cot.precios_por_dia[-3:] == [Decimal("25000.00")] * 3
        # Los de la semana valen menos que un día suelto: es el descuento.
        assert cot.precios_por_dia[0] < Decimal("25000.00")

    def test_suma_exacta_tambien_con_bloques_mezclados(self):
        ts = [
            tarifa(1, TipoTarifa.DIARIA, 25000),
            tarifa(2, TipoTarifa.SEMANAL, 150000),
            tarifa(3, TipoTarifa.MENSUAL, 500000),
        ]
        cot = cotizar_por_bandas(40, ts)
        assert sum(cot.precios_por_dia) == cot.total
