"""
El "por qué ganó" del desglose diario.

El motor siempre supo **qué** regla gobierna cada día; lo que no decía es con
qué criterio ganó. Cuando dos reglas compiten por el mismo día —una promo
general y un precio de vehículo puntual, por ejemplo— esa es justamente la
pregunta que había que contestar haciendo una reserva de prueba.

Estos tests fijan que el motivo informado sea **el primer criterio que separó a
la ganadora de la segunda**, en el mismo orden que usa el desempate real.
"""
from datetime import date
from decimal import Decimal

from app.domain.precios import (
    MOTIVO_ESPECIFICIDAD, MOTIVO_PRIORIDAD, MOTIVO_RANGO, MOTIVO_RECIENTE,
    MOTIVO_UNICA, ReglaPrecio, explicar_regla_dia, resolver_regla_dia,
)

DIA = date(2026, 1, 15)


def regla(id: int, *, prioridad=0, categoria_id=None, vehiculo_id=None,
          desde=date(2026, 1, 1), hasta=date(2026, 1, 31), precio="50000"):
    return ReglaPrecio(
        id=id,
        nombre=f"Regla {id}",
        precio_dia=Decimal(precio),
        fecha_desde=desde,
        fecha_hasta=hasta,
        prioridad=prioridad,
        categoria_id=categoria_id,
        vehiculo_id=vehiculo_id,
    )


def explicar(reglas, **kw):
    return explicar_regla_dia(DIA, reglas, 5, **kw)


class TestMotivos:
    def test_una_sola_candidata(self):
        g, motivo, n = explicar([regla(1)])
        assert (g.id, motivo, n) == (1, MOTIVO_UNICA, 1)

    def test_gana_por_prioridad(self):
        g, motivo, n = explicar([regla(1, prioridad=0), regla(2, prioridad=20)])
        assert (g.id, motivo, n) == (2, MOTIVO_PRIORIDAD, 2)

    def test_la_prioridad_le_gana_a_la_especificidad(self):
        """
        Es la decisión menos intuitiva del motor y está documentada: una promo
        general con prioridad alta le gana a una regla de vehículo puntual.
        El motivo tiene que decir "prioridad", no "especificidad".
        """
        g, motivo, _ = explicar(
            [regla(1, prioridad=20), regla(2, prioridad=0, vehiculo_id=3)],
            vehiculo_id=3,
        )
        assert (g.id, motivo) == (1, MOTIVO_PRIORIDAD)

    def test_gana_por_especificidad(self):
        g, motivo, _ = explicar(
            [regla(1), regla(2, vehiculo_id=3)],
            vehiculo_id=3,
        )
        assert (g.id, motivo) == (2, MOTIVO_ESPECIFICIDAD)

    def test_gana_por_rango_mas_corto(self):
        """"Semana de Navidad" le gana a "temporada alta"."""
        g, motivo, _ = explicar([
            regla(1, desde=date(2026, 1, 1), hasta=date(2026, 1, 31)),
            regla(2, desde=date(2026, 1, 14), hasta=date(2026, 1, 16)),
        ])
        assert (g.id, motivo) == (2, MOTIVO_RANGO)

    def test_gana_la_mas_reciente(self):
        """Empate total: decide el id. Nunca se elige al azar."""
        g, motivo, _ = explicar([regla(1), regla(7)])
        assert (g.id, motivo) == (7, MOTIVO_RECIENTE)

    def test_sin_candidatas(self):
        fuera = regla(1, desde=date(2025, 1, 1), hasta=date(2025, 1, 31))
        assert explicar([fuera]) == (None, None, 0)


class TestCoherenciaConElMotor:
    def test_elige_siempre_lo_mismo_que_resolver_regla_dia(self):
        """
        La explicación no puede diverger del cálculo: si un día se cobra con
        una regla y el desglose nombra otra, es peor que no explicar nada.
        """
        casos = [
            [regla(1), regla(2, prioridad=5)],
            [regla(1, vehiculo_id=3), regla(2, categoria_id=7)],
            [regla(1, desde=date(2026, 1, 10), hasta=date(2026, 1, 20)), regla(2)],
            [regla(3), regla(9)],
        ]
        for reglas in casos:
            esperada = resolver_regla_dia(DIA, reglas, 5, categoria_id=7, vehiculo_id=3)
            obtenida, _, _ = explicar_regla_dia(DIA, reglas, 5, categoria_id=7, vehiculo_id=3)
            assert obtenida == esperada
