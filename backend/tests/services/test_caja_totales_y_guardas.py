"""
Caja, Cobros y Reportes dicen el mismo número; "cuenta corriente" no es plata
en ningún camino; y "Cobros pendientes" lista lo que hay que cobrar ahora.

Lo que pasaba (27/09/2026):

- La caja del día sacaba lo anotado "a cuenta corriente" de los ingresos, pero
  el resumen de Cobros y el reporte mensual lo sumaban: el mismo día daba tres
  números según la pantalla.
- Cobrar un daño o una multa "a cuenta corriente" asentaba un crédito que
  cancelaba la deuda que se quería anotar.
- `/pagos/pendientes` traía todos los alquileres de la historia y todas las
  reservas futuras sin seña, con una consulta por fila.
- `POST /pagos` usaba `es_plata_que_entro` sin importarlo: todo cobro suelto
  desde la caja daba 500.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.cuenta_corriente import CuentaCorriente
from app.models.pago import Pago

HOY = date.today()


def _saldo(db, cliente_id):
    cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente_id).first()
    return Decimal(str(cc.saldo)) if cc else Decimal("0")


class TestLosTotalesCoinciden:
    @pytest.fixture
    def cobros_del_dia(self, hacer_pago, cliente):
        hacer_pago(cliente_id=cliente.id, monto="1000", medio_pago="efectivo", fecha=HOY)
        hacer_pago(cliente_id=cliente.id, monto="300", medio_pago="transferencia", fecha=HOY)
        hacer_pago(cliente_id=cliente.id, monto="500", medio_pago="cuenta_corriente", fecha=HOY)

    def test_caja_cobros_y_reportes_dan_lo_mismo(self, client, cobros_del_dia):
        dia = HOY.isoformat()
        caja = client.get(f"/api/v1/pagos/caja/dia?fecha={dia}").json()["data"]
        cobros = client.get(f"/api/v1/pagos?fecha_desde={dia}&fecha_hasta={dia}").json()["resumen"]
        mes = next(
            m for m in client.get(f"/api/v1/reportes/ingresos?anio={HOY.year}").json()["data"]["meses"]
            if m["mes"] == HOY.month
        )

        assert caja["total_ingresos"] == cobros["total"] == mes["ingresos"] == 1300
        assert caja["total_a_cuenta"] == cobros["total_a_cuenta"] == mes["a_cuenta"] == 500

    def test_el_resultado_del_dia_es_ingresos_menos_gastos(self, client, cobros_del_dia):
        caja = client.get(f"/api/v1/pagos/caja/dia?fecha={HOY.isoformat()}").json()["data"]
        assert caja["resultado_del_dia"] == caja["total_ingresos"] - caja["total_egresos"]
        assert "balance" not in caja


class TestUnCobroSueltoFunciona:
    def test_post_pagos_no_revienta(self, client, cliente):
        r = client.post("/api/v1/pagos", json={
            "cliente_id": cliente.id, "monto": 1000, "medio_pago": "efectivo",
            "fecha": HOY.isoformat(),
        })
        assert r.status_code == 201, r.text


class TestCuentaCorrienteNoEsPlata:
    @pytest.fixture
    def multa_imputada(self, db, cliente, usuario, vehiculo):
        from app.models.multa import Multa
        from app.schemas.multa import MultaUpdate
        from app.services.multa_service import MultaService

        m = Multa(patente=vehiculo.patente, vehiculo_id=vehiculo.id, cliente_id=cliente.id,
                  fecha_infraccion=HOY - timedelta(days=20), monto=Decimal("75000"),
                  estado="pendiente")
        db.add(m)
        db.flush()
        MultaService(db).actualizar(m.id, MultaUpdate(estado="imputada"), usuario.id)
        db.flush()
        return m

    @pytest.fixture
    def danio_imputado(self, db, cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler):
        from app.models.danio import Danio
        from app.services.danio_service import DanioService

        alquiler = hacer_alquiler(hacer_reserva(precio_total="200000", estado="finalizada"))
        d = Danio(vehiculo_id=vehiculo.id, alquiler_id=alquiler.id, cliente_id=cliente.id,
                  momento="checkin", zona="paragolpes", tipo="abolladura", severidad="moderado",
                  fecha_deteccion=HOY, costo_estimado=Decimal("90000"), estado="valorizado")
        db.add(d)
        db.flush()
        DanioService(db).imputar(d.id, Decimal("90000"), usuario_id=usuario.id)
        db.flush()
        return d

    def test_la_multa_a_cuenta_no_cancela_la_deuda(self, db, cliente, usuario, multa_imputada):
        from app.services.multa_service import MultaService

        MultaService(db).resolver(multa_imputada.id, "cobrada", None, usuario.id,
                                  medio_pago="cuenta_corriente", fecha_cobro=HOY)
        db.flush()
        assert db.query(Pago).one().medio_pago == "cuenta_corriente"   # la constancia queda
        assert _saldo(db, cliente.id) == Decimal("75000")               # la deuda también

    def test_el_danio_a_cuenta_no_cancela_la_deuda(self, db, cliente, usuario, danio_imputado):
        from app.services.danio_service import DanioService

        antes = _saldo(db, cliente.id)
        DanioService(db).cobrar(danio_imputado.id, usuario_id=usuario.id,
                                medio_pago="cuenta_corriente", fecha_cobro=HOY)
        db.flush()
        assert _saldo(db, cliente.id) == antes

    def test_el_danio_en_efectivo_si_la_cancela(self, db, cliente, usuario, danio_imputado):
        from app.services.danio_service import DanioService

        antes = _saldo(db, cliente.id)
        DanioService(db).cobrar(danio_imputado.id, usuario_id=usuario.id,
                                medio_pago="efectivo", fecha_cobro=HOY)
        db.flush()
        assert _saldo(db, cliente.id) == antes - Decimal("90000")

    def test_un_recibo_no_puede_ser_a_cuenta(self, db, cliente, usuario):
        from types import SimpleNamespace

        from app.services.recibo_service import ReciboService

        payload = SimpleNamespace(cliente_id=cliente.id, alquiler_id=None, monto=Decimal("100"),
                                  medio_pago="cuenta_corriente", fecha=HOY, concepto="x")
        with pytest.raises(BusinessRuleError):
            ReciboService(db).crear(payload, usuario.id)
        assert db.query(Pago).count() == 0


class TestCobrosPendientes:
    def test_lista_lo_de_ahora_y_no_la_historia(self, db, hacer_reserva, hacer_alquiler):
        from app.routers.pagos import cobros_pendientes

        # Auto afuera, sin cobrar: sí.
        afuera = hacer_alquiler(
            hacer_reserva(precio_total="100000", estado="activa",
                          fecha_inicio=HOY - timedelta(days=1), fecha_fin=HOY + timedelta(days=2)),
            checkout_fecha=HOY - timedelta(days=1),
        )
        # Ya volvió (deuda de cuenta corriente, no de caja): no.
        volvio = hacer_alquiler(
            hacer_reserva(precio_total="100000", estado="finalizada",
                          fecha_inicio=HOY - timedelta(days=9), fecha_fin=HOY - timedelta(days=5)),
            checkout_fecha=HOY - timedelta(days=9),
        )
        volvio.checkin_fecha = HOY - timedelta(days=5)
        # Retira en tres días, sin seña: sí.
        cerca = hacer_reserva(precio_total="50000", fecha_inicio=HOY + timedelta(days=3),
                              fecha_fin=HOY + timedelta(days=5))
        # Retira en dos meses: todavía no es un cobro pendiente.
        hacer_reserva(precio_total="50000", fecha_inicio=HOY + timedelta(days=60),
                      fecha_fin=HOY + timedelta(days=62))
        # Cancelada: no.
        hacer_reserva(precio_total="50000", estado="cancelada",
                      fecha_inicio=HOY + timedelta(days=1), fecha_fin=HOY + timedelta(days=2))
        db.flush()

        items = cobros_pendientes(db, HOY)
        assert {(i["tipo"], i["id_origen"]) for i in items} == {
            ("alquiler_checkout", afuera.id), ("reserva", cerca.id),
        }
        assert all(i["saldo_pendiente"] > 0 for i in items)

    def test_lo_cobrado_online_cuenta(self, db, hacer_reserva, hacer_alquiler, hacer_pago, cliente):
        from app.models.pago_web import PagoWeb
        from app.routers.pagos import cobros_pendientes

        reserva = hacer_reserva(precio_total="100000", estado="activa",
                                fecha_inicio=HOY, fecha_fin=HOY + timedelta(days=2))
        hacer_alquiler(reserva, checkout_fecha=HOY)
        pago = hacer_pago(cliente_id=cliente.id, monto="30000", medio_pago="mercado_pago", fecha=HOY)
        db.add(PagoWeb(reserva_id=reserva.id, pago_id=pago.id, monto=Decimal("30000"),
                       preference_id="pref-1",
                       estado="aprobado", total_reserva=Decimal("100000"),
                       porcentaje_anticipo=30))
        db.flush()

        (item,) = cobros_pendientes(db, HOY)
        assert item["monto_abonado"] == 30000
        assert item["saldo_pendiente"] == 70000

    def test_por_cliente_no_hay_ventana_de_dias(self, db, hacer_reserva, cliente):
        from app.routers.pagos import cobros_pendientes

        lejos = hacer_reserva(precio_total="50000", fecha_inicio=HOY + timedelta(days=60),
                              fecha_fin=HOY + timedelta(days=62))
        assert [i["id_origen"] for i in cobros_pendientes(db, HOY, cliente_id=cliente.id)] == [lejos.id]
