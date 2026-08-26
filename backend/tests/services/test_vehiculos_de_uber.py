"""
Un auto afectado a Uber no es cupo.

Parte de la flota está afectada a Uber y no se alquila. Antes la única forma de
sacarla de la disponibilidad era `activo = false`, que la borra del panel entero
y se lleva puestos sus vencimientos, sus services y sus gastos. Ahora hay un
`destino` (migración 086).

**La forma en que esto falla es la peor posible**: no da error, da *más*
disponibilidad de la que existe. Se vende una unidad que no está y se descubre
el día del retiro, con el cliente en el mostrador. Por eso el test mira
`_cargar_flota`, que es el único punto del que cuelgan la web, el cupo interno y
el selector de auto del paso 3.
"""
from decimal import Decimal

import pytest

from app.core.exceptions import ConflictError
from app.models.vehiculo import Vehiculo
from app.schemas.vehiculo import VehiculoUpdate
from app.services.disponibilidad_service import DisponibilidadService
from app.services.vehiculo_service import VehiculoService


@pytest.fixture()
def flota(db):
    """Tres autos: dos que se alquilan y uno afectado a Uber."""
    autos = [
        Vehiculo(patente="AA111AA", marca="Fiat", modelo="Cronos", anio=2024,
                 tipo="auto", color="blanco", estado="disponible", km_actual=1000,
                 destino="alquiler"),
        Vehiculo(patente="BB222BB", marca="VW", modelo="Amarok", anio=2023,
                 tipo="camioneta", color="gris", estado="disponible", km_actual=2000,
                 destino="alquiler"),
        Vehiculo(patente="CC333CC", marca="Toyota", modelo="Etios", anio=2022,
                 tipo="auto", color="negro", estado="disponible", km_actual=3000,
                 destino="uber"),
    ]
    db.add_all(autos)
    db.flush()
    return autos


class TestNoCuentaParaElCupo:
    def test_la_flota_alquilable_deja_afuera_los_de_uber(self, db, flota):
        ids = {v.id for v in DisponibilidadService(db)._cargar_flota()}
        assert {v.patente for v in flota if v.id in ids} == {"AA111AA", "BB222BB"}

    def test_el_de_uber_sigue_existiendo_y_activo(self, db, flota):
        """
        No es una baja: el auto sigue en la flota con sus vencimientos y sus
        gastos. Ésa es toda la diferencia con `activo = false`.
        """
        uber = db.query(Vehiculo).filter(Vehiculo.patente == "CC333CC").one()
        assert uber.activo is True

    def test_volver_a_alquiler_lo_devuelve_al_cupo(self, db, flota):
        uber = db.query(Vehiculo).filter(Vehiculo.patente == "CC333CC").one()
        VehiculoService(db).update(uber.id, VehiculoUpdate(destino="alquiler"))
        ids = {v.id for v in DisponibilidadService(db)._cargar_flota()}
        assert uber.id in ids


class TestElDefaultEsAlquiler:
    def test_un_auto_cargado_sin_destino_se_alquila(self, db):
        """
        Los 16 vehículos que ya existían no declaran destino. Si el default no
        fuera `alquiler`, la migración vaciaría la flota entera de un saque.
        """
        v = Vehiculo(patente="DD444DD", marca="Peugeot", modelo="208", anio=2025,
                     tipo="auto", color="rojo", estado="disponible", km_actual=0)
        db.add(v)
        db.flush()
        assert v.destino == "alquiler"
        assert v.id in {x.id for x in DisponibilidadService(db)._cargar_flota()}


class TestNoSeLoLlevaUnaReservaPuesta:
    def test_pasarlo_a_uber_con_una_reserva_viva_se_niega(
        self, db, flota, hacer_reserva
    ):
        """
        La reserva no desaparece cuando el auto sale del cupo: queda asignada a
        un vehículo que ya no se alquila, y nadie se entera hasta el retiro.
        """
        vehiculo = db.query(Vehiculo).filter(Vehiculo.patente == "AA111AA").one()
        reserva = hacer_reserva(precio_total="100000", estado="confirmada")
        reserva.vehiculo_id = vehiculo.id
        db.flush()

        with pytest.raises(ConflictError):
            VehiculoService(db).update(vehiculo.id, VehiculoUpdate(destino="uber"))

    def test_sin_reservas_vivas_se_puede(self, db, flota):
        vehiculo = db.query(Vehiculo).filter(Vehiculo.patente == "BB222BB").one()
        VehiculoService(db).update(vehiculo.id, VehiculoUpdate(destino="uber"))
        assert vehiculo.destino == "uber"


class TestVanAlFinalDelListado:
    def test_el_listado_los_ordena_ultimos(self, db, flota):
        """
        El orden lo pone el ORDER BY y no el cliente: con paginado del servidor,
        ordenar la página ya traída dejaría los autos de Uber salteados por el
        medio del listado.
        """
        items, _ = VehiculoService(db).list(page=1, page_size=50)
        destinos = [v.destino for v in items]
        assert destinos == sorted(destinos, key=lambda d: 0 if d == "alquiler" else 1)
        assert destinos[-1] == "uber"
