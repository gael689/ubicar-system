"""
El contrato de Uber: anverso con sus condiciones y cláusula de pasajeros.

Pedido de Franco (01/10/2026): valor de la semana, condición de pago, fechas de
pago, kilometraje y precio del km extra; y en los términos, en lugar de
"el auto no se puede usar para trabajar", la responsabilidad del titular y el
aviso de que el seguro no incluye traslado de pasajeros.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.services.contrato_service import ContratoService
from app.services.reserva_service import ReservaService


def _reserva(db, cliente, usuario, vehiculo, **extra):
    reserva, _ = ReservaService(db).create(
        cliente_id=cliente.id, vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 10, 5), hora_inicio=time(10, 0),
        fecha_fin=date(2026, 10, 19), hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241", lugar_devolucion="Paraguay 241",
        usuario_id=usuario.id, precio_total=Decimal("100000"),
        descuento_motivo="prueba", **extra,
    )
    db.flush()
    return reserva


UBER = dict(
    tipo="uber", uber_valor_semana=Decimal("200000"),
    uber_km_semana=1500, uber_precio_km_extra=Decimal("150"),
    condicion_pago_texto="Semanal adelantada, por transferencia",
)


@pytest.fixture
def uber(db, cliente, usuario, vehiculo):
    return _reserva(db, cliente, usuario, vehiculo, **UBER)


def _c3_a(clausulas):
    c3 = next(c for c in clausulas if c["numero"] == 3)
    return next(p["texto"] for p in c3["parrafos"] if p["texto"].startswith("a)"))


class TestPreparar:
    def test_trae_las_condiciones_de_uber(self, db, uber):
        datos = ContratoService(db).preparar(uber.id)
        assert datos["uber"]["valor_semana"] == 200000.0
        assert datos["uber"]["semanas"] == 2
        assert datos["uber"]["km_semana"] == 1500
        assert datos["uber"]["precio_km_extra"] == 150.0
        assert datos["uber"]["condicion_pago"] == "Semanal adelantada, por transferencia"
        assert datos["uber"]["fechas_pago"] == ["2026-10-05", "2026-10-12"]

    def test_la_linea_de_cargo_es_por_semana(self, db, uber):
        linea = ContratoService(db).preparar(uber.id)["cargos"]["lineas"][0]
        assert linea["concepto"] == "Alquiler semanal"
        assert linea["cantidad"] == 2
        assert linea["valor_unitario"] == 200000.0
        assert linea["total"] == 400000.0

    def test_la_clausula_de_pasajeros_reemplaza_a_la_que_lo_prohibe(self, db, uber):
        texto = _c3_a(ContratoService(db).preparar(uber.id)["clausulas"])
        assert "NO incluye traslado de pasajeros" in texto
        assert "Utilizar el Vehículo para transporte" not in texto

    def test_un_alquiler_normal_no_trae_nada_de_uber(
        self, db, cliente, usuario, vehiculo
    ):
        reserva = _reserva(db, cliente, usuario, vehiculo)
        datos = ContratoService(db).preparar(reserva.id)
        assert datos["uber"] is None
        assert datos["cargos"]["lineas"][0]["concepto"] == "Días de alquiler"
        assert "Utilizar el Vehículo para transporte" in _c3_a(datos["clausulas"])


class TestCrearYPdf:
    def test_el_contrato_congela_la_clausula_de_uber(self, db, uber, usuario):
        svc = ContratoService(db)
        contrato = svc.crear(uber.id, svc.preparar(uber.id), usuario.id)
        assert contrato.snapshot["clausulas_modificadas"] == [3]
        assert "NO incluye traslado de pasajeros" in _c3_a(contrato.snapshot["clausulas"])
        assert contrato.snapshot["uber"]["km_semana"] == 1500

    def test_el_pdf_se_genera(self, db, uber, usuario):
        svc = ContratoService(db)
        contrato = svc.crear(uber.id, svc.preparar(uber.id), usuario.id)
        assert svc.generar_pdf(contrato.id).startswith(b"%PDF")

    def test_se_puede_editar_la_clausula_de_uber_antes_de_generar(
        self, db, uber, usuario
    ):
        svc = ContratoService(db)
        datos = svc.preparar(uber.id)
        c3 = next(c for c in datos["clausulas"] if c["numero"] == 3)
        i = next(i for i, p in enumerate(c3["parrafos"]) if p["texto"].startswith("a)"))
        c3["parrafos"][i]["texto"] = "a) Texto negociado con el conductor."
        contrato = svc.crear(uber.id, datos, usuario.id)
        assert _c3_a(contrato.snapshot["clausulas"]) == "a) Texto negociado con el conductor."
