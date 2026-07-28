"""
Tests del cálculo de cupo por categoría (domain/disponibilidad.py).

El caso que más importa es `test_reserva_por_categoria_sin_vehiculo_ocupa`:
es el que produce sobreventa si se olvida, porque una reserva web sin auto
asignado no aparece en el solapamiento de ningún vehículo pero ya está vendida.
"""
from datetime import datetime, timedelta

import pytest

from app.domain.disponibilidad import (
    CupoCategoria,
    OcupacionCategoria,
    VehiculoDisponible,
    calcular_cupo,
    calcular_cupos,
    dias_de_alquiler,
    solapa,
    validar_rango_web,
)


# Flota de prueba: 3 compactos (cat 1) y 2 pick-ups (cat 5).
FLOTA = [
    VehiculoDisponible(id=1, categoria_id=1),
    VehiculoDisponible(id=2, categoria_id=1),
    VehiculoDisponible(id=3, categoria_id=1),
    VehiculoDisponible(id=10, categoria_id=5),
    VehiculoDisponible(id=11, categoria_id=5),
]

INICIO = datetime(2026, 9, 3, 10, 0)
FIN = datetime(2026, 9, 10, 10, 0)


def ocup(**kw) -> OcupacionCategoria:
    base = dict(inicio=INICIO, fin=FIN)
    base.update(kw)
    return OcupacionCategoria(**base)


class TestCalcularCupo:
    def test_sin_ocupaciones_todo_libre(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [])
        assert c.total == 3
        assert c.disponibles == 3
        assert c.vehiculos_libres == [1, 2, 3]

    def test_reserva_con_vehiculo_descuenta_uno(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(vehiculo_id=1)])
        assert c.disponibles == 2
        assert c.vehiculos_libres == [2, 3]

    def test_reserva_por_categoria_sin_vehiculo_ocupa(self):
        """
        El caso que produce sobreventa si se olvida: la reserva web todavía no
        tiene auto asignado, pero la unidad ya está vendida.
        """
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(categoria_id=1)])
        assert c.disponibles == 2
        # No se sabe cuál auto, así que los 3 siguen "libres" para asignar.
        assert c.vehiculos_libres == [1, 2, 3]

    def test_mezcla_de_ambos_tipos(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1),
            ocup(categoria_id=1),
        ])
        assert c.disponibles == 1

    def test_bloqueo_descuenta(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(vehiculo_id=2, origen="bloqueo")])
        assert c.disponibles == 2
        assert 2 not in c.vehiculos_libres

    def test_hold_descuenta(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(categoria_id=1, origen="hold")])
        assert c.disponibles == 2

    def test_el_mismo_auto_ocupado_dos_veces_cuenta_una(self):
        """Reserva + bloqueo sobre el mismo auto no puede descontar 2 unidades."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1),
            ocup(vehiculo_id=1, origen="bloqueo"),
        ])
        assert c.disponibles == 2

    def test_ocupacion_de_otra_categoria_no_afecta(self):
        """Bloquear una pick-up no baja el cupo de los compactos."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=10, origen="bloqueo"),
            ocup(categoria_id=5),
        ])
        assert c.disponibles == 3

    def test_ocupacion_fuera_del_rango_no_afecta(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1,
                 inicio=datetime(2026, 10, 1), fin=datetime(2026, 10, 5)),
        ])
        assert c.disponibles == 3

    def test_ocupacion_adyacente_no_solapa(self):
        """El auto vuelve el 3 a las 10:00 y sale de nuevo a las 10:00."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1, inicio=datetime(2026, 9, 1, 10, 0), fin=INICIO),
        ])
        assert c.disponibles == 3

    def test_sin_cupo(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1), ocup(vehiculo_id=2), ocup(vehiculo_id=3),
        ])
        assert c.disponibles == 0
        assert not c.hay_cupo

    def test_nunca_negativo(self):
        """Si algo quedó mal cargado, 0 es la respuesta segura — nunca -1."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(categoria_id=1) for _ in range(5)])
        assert c.disponibles == 0

    def test_ultima_unidad(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(vehiculo_id=1), ocup(vehiculo_id=2)])
        assert c.ultima_unidad
        assert c.hay_cupo

    def test_categoria_sin_autos(self):
        c = calcular_cupo(99, INICIO, FIN, FLOTA, [])
        assert c.total == 0
        assert not c.hay_cupo

    def test_vehiculo_sin_categoria_no_suma_a_ninguna(self):
        """Los 9 autos sin categoría asignada no deben inflar ningún cupo."""
        flota = FLOTA + [VehiculoDisponible(id=50, categoria_id=None)]
        assert calcular_cupo(1, INICIO, FIN, flota, []).total == 3


class TestCalcularCupos:
    def test_todas_las_categorias(self):
        cupos = calcular_cupos(INICIO, FIN, FLOTA, [])
        assert [c.categoria_id for c in cupos] == [1, 5]
        assert [c.disponibles for c in cupos] == [3, 2]

    def test_filtra_por_categoria(self):
        cupos = calcular_cupos(INICIO, FIN, FLOTA, [], categoria_ids=[5])
        assert len(cupos) == 1
        assert cupos[0].categoria_id == 5


class TestValidarRangoWeb:
    AHORA = datetime(2026, 9, 1, 12, 0)

    def _validar(self, inicio, fin, **kw):
        validar_rango_web(inicio, fin, self.AHORA, **kw)

    def test_rango_valido(self):
        self._validar(datetime(2026, 9, 5, 10, 0), datetime(2026, 9, 8, 10, 0))

    def test_fin_antes_del_inicio(self):
        with pytest.raises(ValueError, match="posterior"):
            self._validar(datetime(2026, 9, 8), datetime(2026, 9, 5))

    def test_en_el_pasado(self):
        with pytest.raises(ValueError, match="ya pasó"):
            self._validar(datetime(2026, 8, 1), datetime(2026, 8, 5))

    def test_sin_anticipacion_suficiente(self):
        """Reservar hoy para mañana temprano: el auto no llega a estar listo."""
        with pytest.raises(ValueError, match="anticipación"):
            self._validar(datetime(2026, 9, 1, 20, 0), datetime(2026, 9, 5))

    def test_anticipacion_configurable(self):
        # Con 2 h de mínimo, el mismo rango que fallaba ahora pasa.
        self._validar(
            datetime(2026, 9, 1, 20, 0), datetime(2026, 9, 5),
            anticipacion_minima_horas=2,
        )

    def test_duracion_maxima(self):
        with pytest.raises(ValueError, match="contactanos"):
            self._validar(datetime(2026, 9, 5), datetime(2027, 9, 5))


class TestHelpers:
    def test_solapa(self):
        assert solapa(datetime(2026, 9, 1), datetime(2026, 9, 5),
                      datetime(2026, 9, 3), datetime(2026, 9, 8))
        assert not solapa(datetime(2026, 9, 1), datetime(2026, 9, 5),
                          datetime(2026, 9, 5), datetime(2026, 9, 8))

    def test_dias_de_alquiler_no_cuenta_el_dia_de_devolucion(self):
        from datetime import date
        assert dias_de_alquiler(date(2026, 9, 3), date(2026, 9, 10)) == 7
