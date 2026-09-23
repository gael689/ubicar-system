"""
Corregir el año de un auto cambia el año.

**El reporte:** *"hay un auto mal cargado el año, lo modifico y queda igual"*.
No era demora ni caché: `VehiculoUpdate` no tenía `anio`, y Pydantic descarta
en silencio lo que el schema no conoce. El formulario mandaba el año, el
backend contestaba "Vehículo actualizado" y no tocaba nada. Lo mismo pasaba
con `tipo`.
"""
from app.models.vehiculo import Vehiculo
from app.schemas.vehiculo import VehiculoUpdate
from app.services.vehiculo_service import VehiculoService


def _auto(db):
    v = Vehiculo(patente="AA111AA", marca="Fiat", modelo="Cronos", anio=2004,
                 tipo="auto", color="blanco", estado="disponible", km_actual=1000,
                 destino="alquiler")
    db.add(v)
    db.flush()
    return v


def test_el_anio_se_actualiza(db):
    v = _auto(db)
    VehiculoService(db).update(v.id, VehiculoUpdate(anio=2024))
    db.refresh(v)
    assert v.anio == 2024


def test_el_tipo_tambien(db):
    v = _auto(db)
    VehiculoService(db).update(v.id, VehiculoUpdate(tipo="camioneta"))
    db.refresh(v)
    assert v.tipo == "camioneta"


def test_lo_que_no_se_manda_no_se_toca(db):
    v = _auto(db)
    VehiculoService(db).update(v.id, VehiculoUpdate(color="negro"))
    db.refresh(v)
    assert (v.anio, v.tipo, v.color) == (2004, "auto", "negro")
