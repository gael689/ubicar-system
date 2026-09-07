"""
El calendario devuelve la flota en el orden que alguien acomodó a mano.

**El reporte**, del mostrador: *"cuando muevo los autos de fila, al otro día
abro el programa y se volvieron a cambiar de lugar"*.

Y no era que no se guardara. Arrastrar una fila hace `PUT /vehiculos/reorder`,
que escribe `Vehiculo.orden`, y la pantalla de Flota lo respeta desde siempre
(`vehiculo_repo.list_filtered`). **El que lo ignoraba era el propio calendario**:
`GET /ocupacion` ordenaba por patente. O sea que la pantalla donde se define el
orden era la única que no lo mostraba.

En el mismo `ORDER BY` entra lo otro que pidieron: *"la categoría Uber de un
auto se debe ver en el calendario, pero los autos debajo del todo, no entre
medio de los otros"*. Uber no es una categoría —un auto de Uber sigue siendo una
Pick-up, ver migración 086— sino `Vehiculo.destino`, y lo que corresponde es que
no se mezcle con lo que sí se alquila.
"""
from datetime import date, timedelta

import pytest

from app.models.vehiculo import Vehiculo
from app.routers.ocupacion import get_ocupacion


@pytest.fixture
def flota(db):
    """
    Cuatro autos donde el orden manual y el alfabético **no coinciden**: si el
    endpoint ordenara por patente, el test no podría distinguirlo.
    """
    autos = [
        # (patente, orden, destino)
        ("ZZ999ZZ", 0, "alquiler"),   # última por patente, primera a mano
        ("AA111AA", 1, "alquiler"),
        ("MM555MM", 2, "alquiler"),
        ("BB222BB", 0, "uber"),       # primera por patente, pero no se alquila
    ]
    creados = []
    for patente, orden, destino in autos:
        v = Vehiculo(
            patente=patente, marca="Fiat", modelo="Cronos", anio=2024,
            tipo="auto", color="blanco", estado="disponible",
            orden=orden, destino=destino, activo=True, km_actual=0,
        )
        db.add(v)
        creados.append(v)
    db.flush()
    return creados


def _patentes(db):
    hoy = date.today()
    respuesta = get_ocupacion(
        fecha_inicio=hoy,
        fecha_fin=hoy + timedelta(days=7),
        vehiculo_ids=None,
        db=db,
        _=None,
    )
    return [v.patente for v in respuesta["data"].vehiculos]


class TestElOrdenDeLaFlota:
    def test_manda_el_orden_manual_y_no_la_patente(self, db, flota):
        assert _patentes(db)[:3] == ["ZZ999ZZ", "AA111AA", "MM555MM"]

    def test_los_de_uber_van_al_final(self, db, flota):
        """
        `BB222BB` es la primera alfabéticamente y tiene `orden = 0`. Va última
        igual, porque no se alquila.
        """
        assert _patentes(db)[-1] == "BB222BB"


class TestElVehiculoLlegaConLoQueElFrontNecesita:
    def test_transporta_orden_y_destino(self, db, flota):
        """
        Sin estos dos campos el calendario no puede ni respetar el orden del
        lado del cliente ni separar los de Uber en su propio grupo — y ninguno
        de los dos viajaba.
        """
        hoy = date.today()
        respuesta = get_ocupacion(
            fecha_inicio=hoy, fecha_fin=hoy + timedelta(days=7),
            vehiculo_ids=None, db=db, _=None,
        )
        por_patente = {v.patente: v for v in respuesta["data"].vehiculos}

        assert por_patente["ZZ999ZZ"].orden == 0
        assert por_patente["ZZ999ZZ"].destino == "alquiler"
        assert por_patente["BB222BB"].destino == "uber"
