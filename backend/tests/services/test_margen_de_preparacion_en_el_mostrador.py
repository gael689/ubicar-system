"""
El margen de preparación es un aviso en el mostrador, no un bloqueo.

Caso real (04/10/2026): un auto volvía a las 07:50 y el mostrador quiso
reservarlo desde las 09:00. El auto no aparecía como libre —solo salía el que
no tenía nada antes— porque `disponibilidad.margen_rotacion_horas` (2 h) corría
el fin de la reserva anterior a las 09:50.

El margen existe para que **la web** no venda un auto que no está listo. En el
mostrador hay una persona que sabe si se puede dejar listo en una hora, y
`ReservaService` ya lo permitía al guardar: lo que fallaba era el listado.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.models.categoria import Categoria
from app.services.disponibilidad_service import DisponibilidadService
from app.services.reserva_service import ReservaService

MANIANA = date(2026, 10, 5)
LUNES = date(2026, 10, 9)


@pytest.fixture
def auto_con_contrato_hasta_las_0750(db, cliente, usuario, vehiculo):
    cat = Categoria(codigo="margen-test", nombre="Margen", orden=1, activo=True)
    db.add(cat)
    db.flush()
    vehiculo.categoria_id = cat.id
    db.flush()
    ReservaService(db).create(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 10, 4),
        hora_inicio=time(7, 0),
        fecha_fin=MANIANA,
        hora_fin=time(7, 50),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("100000"),
        descuento_motivo="prueba",
        usuario_id=usuario.id,
    )
    db.flush()
    return vehiculo


def _libres(db, **kw):
    mapa = DisponibilidadService(db).unidades_libres(
        MANIANA, time(9, 0), LUNES, time(9, 0), **kw
    )
    return {vid for lista in mapa.values() for vid in lista}


def test_en_el_mostrador_el_auto_que_vuelve_a_las_0750_se_ofrece_a_las_0900(
    db, auto_con_contrato_hasta_las_0750
):
    assert auto_con_contrato_hasta_las_0750.id in _libres(db, con_margen=False)


def test_con_margen_el_auto_sigue_ocupado_hasta_las_0950(
    db, auto_con_contrato_hasta_las_0750
):
    """El criterio de la web no cambia."""
    assert auto_con_contrato_hasta_las_0750.id not in _libres(db, con_margen=True)


def test_el_default_sigue_siendo_con_margen(db, auto_con_contrato_hasta_las_0750):
    assert auto_con_contrato_hasta_las_0750.id not in _libres(db)


def test_guardar_la_reserva_ya_lo_permitia(
    db, cliente, usuario, auto_con_contrato_hasta_las_0750
):
    reserva, _ = ReservaService(db).create(
        cliente_id=cliente.id,
        vehiculo_id=auto_con_contrato_hasta_las_0750.id,
        fecha_inicio=MANIANA,
        hora_inicio=time(9, 0),
        fecha_fin=LUNES,
        hora_fin=time(9, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("100000"),
        descuento_motivo="prueba",
        usuario_id=usuario.id,
    )
    assert reserva.vehiculo_id == auto_con_contrato_hasta_las_0750.id


class TestElAvisoDeQueVuelveJustoAntes:
    """El auto aparece libre, y el mostrador se entera de que vuelve a las 07:50."""

    def test_dice_cuando_vuelve_el_auto_que_vuelve_justo_antes(
        self, db, auto_con_contrato_hasta_las_0750
    ):
        ajustados = DisponibilidadService(db).vuelven_justo_antes(MANIANA, time(9, 0), LUNES)
        assert ajustados[auto_con_contrato_hasta_las_0750.id].time() == time(7, 50)

    def test_si_el_retiro_es_pasado_el_margen_no_hay_aviso(
        self, db, auto_con_contrato_hasta_las_0750
    ):
        # 07:50 + 2 h = 09:50: a las 10:00 ya está preparado.
        assert DisponibilidadService(db).vuelven_justo_antes(MANIANA, time(10, 0), LUNES) == {}

    def test_un_auto_que_no_vuelve_ese_dia_no_tiene_aviso(
        self, db, auto_con_contrato_hasta_las_0750
    ):
        assert DisponibilidadService(db).vuelven_justo_antes(date(2026, 10, 20), time(9, 0), date(2026, 10, 22)) == {}

    def test_el_endpoint_lo_manda_en_el_auto(self, client, auto_con_contrato_hasta_las_0750):
        r = client.get("/api/v1/disponibilidad/vehiculos", params={
            "fecha_inicio": MANIANA.isoformat(), "hora_inicio": "09:00:00",
            "fecha_fin": LUNES.isoformat(), "hora_fin": "09:00:00",
        })
        auto = next(v for v in r.json()["data"]["vehiculos"] if v["id"] == auto_con_contrato_hasta_las_0750.id)
        assert auto["vuelve_a"] == "07:50"
        assert auto["minutos_para_prepararlo"] == 70
