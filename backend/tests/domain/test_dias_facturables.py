"""
Los días que se cobran miran también el horario (plan 27/09, A1).

Un día de alquiler son 24 horas desde el retiro. Hasta ahora los días se
contaban sólo por fecha y el rato de más se cobraba con un tilde de "late
check-in" y un cargo escrito a mano: si alguien se olvidaba del tilde, el día
se regalaba. La regla ahora es una función pura, `tarifas.dias_facturables`,
y la usa todo el sistema.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.domain.precios import cotizar
from app.domain.tarifas import (
    TOLERANCIA_DEVOLUCION_MINUTOS, dia_extra_por_horario, dias_facturables,
)

LUNES = date(2026, 10, 5)
MIERCOLES = date(2026, 10, 7)


class TestLaRegla:
    def test_misma_hora_son_los_dias_de_calendario(self):
        assert dias_facturables(LUNES, time(10, 0), MIERCOLES, time(10, 0)) == 2

    def test_dentro_de_la_tolerancia_no_suma(self):
        assert TOLERANCIA_DEVOLUCION_MINUTOS == 59
        assert dias_facturables(LUNES, time(10, 0), MIERCOLES, time(10, 59)) == 2

    def test_una_hora_despues_suma_un_dia(self):
        assert dias_facturables(LUNES, time(10, 0), MIERCOLES, time(11, 0)) == 3

    def test_devolver_mas_temprano_no_descuenta(self):
        assert dias_facturables(LUNES, time(10, 0), MIERCOLES, time(8, 0)) == 2

    def test_el_mismo_dia_es_un_dia_aunque_sean_muchas_horas(self):
        """07:30 a 18:40 del mismo día: la regla del mostrador de siempre."""
        assert dias_facturables(LUNES, time(7, 30), LUNES, time(18, 40)) == 1

    def test_sin_horarios_cuenta_solo_fechas(self):
        assert dias_facturables(LUNES, None, MIERCOLES, None) == 2

    def test_acepta_horas_como_texto(self):
        """Así llegan del formulario: "HH:MM"."""
        assert dia_extra_por_horario("10:00", "12:30") is True
        assert dia_extra_por_horario("10:00", "10:30") is False


class TestLaCotizacion:
    def test_el_dia_extra_entra_como_un_dia_mas(self):
        c = cotizar(
            LUNES, MIERCOLES, reglas=[], precio_fallback=Decimal("10000"),
            hora_inicio=time(10, 0), hora_fin=time(12, 0),
        )
        assert c.duracion_dias == 3
        assert c.subtotal == Decimal("30000")
        # El día que se agrega es el de devolución.
        assert c.dias[-1].fecha == MIERCOLES

    def test_sin_horarios_es_lo_de_siempre(self):
        c = cotizar(LUNES, MIERCOLES, reglas=[], precio_fallback=Decimal("10000"))
        assert c.duracion_dias == 2

    @pytest.mark.parametrize("hora_fin, dias", [(time(10, 59), 1), (time(11, 0), 2)])
    def test_un_dia_con_horas(self, hora_fin, dias):
        c = cotizar(
            LUNES, date(2026, 10, 6), reglas=[], precio_fallback=Decimal("10000"),
            hora_inicio=time(10, 0), hora_fin=hora_fin, mismo_dia_es_un_dia=True,
        )
        assert c.duracion_dias == dias

    def test_el_mismo_dia_no_suma(self):
        c = cotizar(
            LUNES, LUNES, reglas=[], precio_fallback=Decimal("10000"),
            hora_inicio=time(7, 30), hora_fin=time(18, 40), mismo_dia_es_un_dia=True,
        )
        assert c.duracion_dias == 1
