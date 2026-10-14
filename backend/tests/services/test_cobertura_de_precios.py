"""
Qué categorías se pueden vender en la web y desde cuándo no (14/10).

El 14/10 la web no podía cotizar ninguna categoría y nada lo avisaba: la web
mostraba "sin disponibilidad", igual que si no hubiera autos. `cobertura` es el
cálculo que alimenta la tabla de Precios y el aviso de la campana.
"""
from datetime import date, timedelta

import pytest

from app.domain.notificaciones_reglas import categoria_web_sin_precio
from app.models.categoria import Categoria
from app.models.tarifa import Tarifa
from app.models.vehiculo import Vehiculo
from app.services.precio_service import PrecioService

HOY = date.today()


@pytest.fixture()
def categoria(db):
    cat = Categoria(codigo="cob-test", nombre="Compacto test", orden=1, activo=True, visible_web=True)
    db.add(cat)
    db.flush()
    db.add(Vehiculo(patente="CB111AA", marca="Fiat", modelo="Cronos", anio=2024, tipo="auto",
                    color="blanco", estado="disponible", km_actual=0, categoria_id=cat.id))
    db.flush()
    return cat


def _fila(db, cat):
    filas = PrecioService(db).cobertura(HOY, HOY + timedelta(days=30))
    return next(f for f in filas if f["categoria_id"] == cat.id)


def test_sin_tarifa_diaria_todos_los_dias_son_hueco(db, categoria):
    f = _fila(db, categoria)
    assert f["dias_sin_precio"] == 31
    assert f["primer_dia_sin_precio"] == HOY


def test_con_tarifa_diaria_de_la_categoria_no_hay_huecos(db, categoria):
    db.add(Tarifa(categoria_id=categoria.id, tipo="diaria", monto=50000, activo=True))
    db.flush()
    assert _fila(db, categoria)["dias_sin_precio"] == 0


def test_la_tarifa_de_un_auto_no_le_da_precio_a_la_web(db, categoria):
    auto = db.query(Vehiculo).filter(Vehiculo.patente == "CB111AA").one()
    db.add(Tarifa(vehiculo_id=auto.id, tipo="diaria", monto=50000, activo=True))
    db.flush()
    assert _fila(db, categoria)["dias_sin_precio"] == 31


def test_el_aviso_sale_por_la_categoria_publicada_sin_precio(db, categoria):
    avisos = [a for a in categoria_web_sin_precio(db, HOY) if a["entidad_id"] == categoria.id]
    assert len(avisos) == 1
    assert avisos[0]["url_destino"] == "/precios"
    assert avisos[0]["urgencia"] == "critica"


def test_no_avisa_si_no_esta_en_la_web_o_tiene_precio(db, categoria):
    categoria.visible_web = False
    db.flush()
    assert not [a for a in categoria_web_sin_precio(db, HOY) if a["entidad_id"] == categoria.id]
    categoria.visible_web = True
    db.add(Tarifa(categoria_id=categoria.id, tipo="diaria", monto=50000, activo=True))
    db.flush()
    assert not [a for a in categoria_web_sin_precio(db, HOY) if a["entidad_id"] == categoria.id]
