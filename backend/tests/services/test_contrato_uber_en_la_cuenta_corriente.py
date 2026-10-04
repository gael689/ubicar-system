"""
El contrato de Uber en la cuenta corriente (04/10/2026).

- Al entregar el auto se genera **un débito por semana**, cada uno con su fecha
  de pago, y la suma da siempre el total exacto.
- Al devolverlo se cobra el kilometraje que pasó del tope pactado.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.domain.enums import DecisionExcedente
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.services.alquiler_service import AlquilerService
from app.services.reserva_service import ReservaService


@pytest.fixture
def reserva_uber(db, cliente, usuario, vehiculo):
    reserva, _ = ReservaService(db).create(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 10, 5),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 10, 19),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        usuario_id=usuario.id,
        tipo="uber",
        uber_valor_semana=Decimal("200000"),
        uber_km_semana=1500,
        uber_precio_km_extra=Decimal("150"),
    )
    db.flush()
    return reserva


def _entregar(db, reserva, vehiculo, usuario, km=1000):
    alquiler, _ = AlquilerService(db).checkout(
        reserva_id=reserva.id,
        checkout_fecha=date(2026, 10, 5),
        checkout_hora=time(10, 0),
        checkout_km=km,
        checkout_combustible=100,
        checkout_descripcion=None,
        usuario_id=usuario.id,
    )
    db.flush()
    return alquiler


def _debitos(db, reserva_id, naturaleza):
    return (
        db.query(MovimientoCuentaCorriente)
        .filter(
            MovimientoCuentaCorriente.reserva_id == reserva_id,
            MovimientoCuentaCorriente.tipo == "debito",
            MovimientoCuentaCorriente.naturaleza == naturaleza,
            MovimientoCuentaCorriente.anulado.is_(False),
        )
        .order_by(MovimientoCuentaCorriente.fecha_vencimiento)
        .all()
    )


class TestAlEntregar:
    def test_un_debito_por_semana_con_su_fecha(self, db, usuario, vehiculo, reserva_uber):
        vehiculo.km_actual = 1000
        _entregar(db, reserva_uber, vehiculo, usuario)

        debitos = _debitos(db, reserva_uber.id, "alquiler")
        assert [d.fecha_vencimiento for d in debitos] == [date(2026, 10, 5), date(2026, 10, 12)]
        assert [d.monto for d in debitos] == [Decimal("200000.00"), Decimal("200000.00")]

    def test_la_suma_es_el_total_del_contrato(self, db, usuario, vehiculo, reserva_uber):
        vehiculo.km_actual = 1000
        _entregar(db, reserva_uber, vehiculo, usuario)
        debitos = _debitos(db, reserva_uber.id, "alquiler")
        assert sum(d.monto for d in debitos) == reserva_uber.precio_total

    def test_los_conceptos_dicen_que_semana_es(self, db, usuario, vehiculo, reserva_uber):
        vehiculo.km_actual = 1000
        _entregar(db, reserva_uber, vehiculo, usuario)
        debitos = _debitos(db, reserva_uber.id, "alquiler")
        assert "semana 1 de 2" in debitos[0].concepto
        assert "semana 2 de 2" in debitos[1].concepto


class TestAlDevolver:
    def _devolver(self, db, alquiler, usuario, km):
        AlquilerService(db).checkin(
            alquiler_id=alquiler.id,
            checkin_fecha=date(2026, 10, 19),
            checkin_hora=time(10, 0),
            checkin_km=km,
            checkin_combustible=100,
            checkin_descripcion=None,
            decision_excedente=DecisionExcedente.NO_COBRAR,
            usuario_id=usuario.id,
        )
        db.flush()

    def test_pasado_del_tope_cobra_el_km_extra(self, db, usuario, vehiculo, reserva_uber):
        vehiculo.km_actual = 1000
        alquiler = _entregar(db, reserva_uber, vehiculo, usuario, km=1000)
        # 14 días → 3.000 km permitidos. Recorre 3.400 → 400 de más × $150.
        self._devolver(db, alquiler, usuario, km=1000 + 3400)

        cargos = _debitos(db, reserva_uber.id, "cargo_cierre")
        assert len(cargos) == 1
        assert cargos[0].monto == Decimal("60000.00")
        assert "Kilometraje extra" in cargos[0].concepto

    def test_dentro_del_tope_no_cobra_nada(self, db, usuario, vehiculo, reserva_uber):
        vehiculo.km_actual = 1000
        alquiler = _entregar(db, reserva_uber, vehiculo, usuario, km=1000)
        self._devolver(db, alquiler, usuario, km=1000 + 2800)
        assert _debitos(db, reserva_uber.id, "cargo_cierre") == []
