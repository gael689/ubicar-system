"""
Un auto destildado en "En web" no es cupo del sitio, pero sí del mostrador.

Ubicar toma autos de terceros por unas semanas para realquilarlos. Con la web
vendiendo sola, esos autos sumaban cupo y el sitio prometía una unidad que en
dos semanas ya no iba a estar (pedido del 14/10/2026, migración 106).
"""
import pytest

from app.models.vehiculo import Vehiculo
from app.schemas.vehiculo import VehiculoUpdate
from app.services.disponibilidad_service import DisponibilidadService
from app.services.vehiculo_service import VehiculoService


@pytest.fixture()
def flota(db):
    autos = [
        Vehiculo(patente="AA111AA", marca="Fiat", modelo="Cronos", anio=2024,
                 tipo="auto", color="blanco", estado="disponible", km_actual=1000),
        Vehiculo(patente="TT999TT", marca="Fiat", modelo="Cronos", anio=2024,
                 tipo="auto", color="gris", estado="disponible", km_actual=1000,
                 en_web=False),
    ]
    db.add_all(autos)
    db.flush()
    return autos


def _patentes(db, flota, **kw):
    ids = {v.id for v in DisponibilidadService(db)._cargar_flota(**kw)}
    return {v.patente for v in flota if v.id in ids}


def test_la_web_no_cuenta_el_temporal(db, flota):
    assert _patentes(db, flota, solo_web=True) == {"AA111AA"}


def test_el_mostrador_si_lo_cuenta(db, flota):
    assert _patentes(db, flota, incluir_uber=True) == {"AA111AA", "TT999TT"}
    assert _patentes(db, flota) == {"AA111AA", "TT999TT"}


def test_un_auto_nuevo_arranca_en_la_web(db):
    v = Vehiculo(patente="NN000NN", marca="VW", modelo="Gol", anio=2025,
                 tipo="auto", color="rojo", estado="disponible", km_actual=0)
    db.add(v)
    db.flush()
    assert v.en_web is True


def test_tildarlo_lo_devuelve_a_la_web(db, flota):
    temporal = flota[1]
    VehiculoService(db).update(temporal.id, VehiculoUpdate(en_web=True))
    assert _patentes(db, flota, solo_web=True) == {"AA111AA", "TT999TT"}
