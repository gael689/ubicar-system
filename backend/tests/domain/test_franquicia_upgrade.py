"""
De qué categoría sale la franquicia que se imprime en el contrato (D-64).

La regla es: **manda el vehículo que se entrega**, no el que se contrató. Si
alguien reservó un Compacto y se le entrega una Pick-up al mismo precio
(upgrade, D-54), el contrato dice la franquicia de la Pick-up.

El fundamento es operativo: el contrato se firma **al momento de entregar el
auto**, así que cuando el cliente firma ya sabe qué vehículo se lleva. No hay
sorpresa posterior, y Ubicar no absorbe una diferencia de riesgo por una
cortesía comercial.

Esto no tenía ningún test, y el código hacía lo contrario — leía la categoría
contratada primero. Un test acá es lo que evita que se vuelva a dar vuelta sin
que nadie lo note.
"""
from types import SimpleNamespace

from app.services.contrato_service import ContratoService


def _categoria(nombre: str, franquicia):
    return SimpleNamespace(nombre=nombre, franquicia_base=franquicia)


def _reserva(categoria_contratada, categoria_del_vehiculo):
    """Una reserva con o sin vehículo asignado."""
    vehiculo = (
        SimpleNamespace(categoria=categoria_del_vehiculo)
        if categoria_del_vehiculo is not None else None
    )
    return SimpleNamespace(
        categoria=categoria_contratada,
        vehiculo=vehiculo,
        adicionales=[],
    )


class _QueryVacia:
    """Lo mínimo para que `_bloque_coberturas` liste el catálogo de coberturas
    ofrecidas. Vacío: acá se está probando de qué categoría sale la
    franquicia, no qué coberturas hay cargadas."""
    def filter(self, *_a, **_k): return self
    def order_by(self, *_a, **_k): return self
    def all(self): return []


class _DbFalsa:
    def query(self, *_a, **_k): return _QueryVacia()


def _franquicia(reserva) -> float | None:
    servicio = ContratoService.__new__(ContratoService)
    servicio.db = _DbFalsa()
    return servicio._bloque_coberturas(reserva)["franquicia"]


COMPACTO = _categoria("Compacto", 1_500_000)
PICKUP = _categoria("Pick-up", 3_000_000)
SIN_CARGAR = _categoria("SUV", None)


class TestFranquiciaSegunElVehiculoEntregado:
    def test_upgrade_usa_la_franquicia_del_auto_entregado(self):
        """Contrató Compacto, se lleva una Pick-up: rige $3.000.000."""
        assert _franquicia(_reserva(COMPACTO, PICKUP)) == 3_000_000

    def test_downgrade_tambien_usa_la_del_entregado(self):
        """La regla no distingue para qué lado: manda lo que se entrega."""
        assert _franquicia(_reserva(PICKUP, COMPACTO)) == 1_500_000

    def test_sin_upgrade_da_lo_mismo(self):
        assert _franquicia(_reserva(COMPACTO, COMPACTO)) == 1_500_000

    def test_sin_vehiculo_asignado_cae_en_la_contratada(self):
        """Reserva por categoría todavía sin auto: no hay entregado que mirar."""
        assert _franquicia(_reserva(COMPACTO, None)) == 1_500_000

    def test_categoria_sin_franquicia_cargada_da_None_y_no_cero(self):
        """`0` se leería como "no pagás nada", que es lo contrario de lo que
        significa. `None` es la señal de "todavía no cargado" que la campana
        reclama — regla vigente de D-53."""
        assert _franquicia(_reserva(SIN_CARGAR, SIN_CARGAR)) is None
