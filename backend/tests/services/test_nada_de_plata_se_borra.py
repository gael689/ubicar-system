"""
Ni un cobro ni un gasto se borran: se dan de baja con motivo.

`PLAN_DINERO.md` §3.3b y Fase 7. Eran los dos últimos borrados físicos del
sistema.

`DELETE /pagos/{id}` hacía `db.delete(pago)`, y el comentario del código lo
admitía: *"el único borrado real que quedó en el sistema, y por eso el que más
falta hace auditar: después del delete no queda ninguna fila que pueda contar
qué había ni quién la sacó"*. Sacaba plata de la caja de cualquier fecha pasada
y el cobro desaparecía del historial del cliente.

`DELETE /gastos/{id}` hacía lo mismo, justificado con *"gastos no son entidad
auditada en F1"*. Dejó de ser cierto: son la mitad del reporte de flota y desde
la Fase 2.5 restan del efectivo del cajón.

Decisión 4 del dueño: **nadie debe usar el borrado físico.**
"""
from datetime import date
from decimal import Decimal

import pytest

from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.gasto import Gasto
from app.models.pago import Pago
from app.services.caja_service import CajaService
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.gasto_service import GastoService

HOY = date(2026, 8, 10)
API = "/api/v1"


@pytest.fixture()
def cobro(db, cliente, usuario, hacer_pago):
    """Un cobro con su crédito, como lo deja `POST /pagos`."""
    pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                      medio_pago="efectivo", fecha=HOY)
    CuentaCorrienteService(db).registrar_movimiento(
        cliente_id=cliente.id, tipo="credito", naturaleza="pago",
        concepto="Cobro a cuenta (efectivo)", monto=Decimal("100000"),
        fecha=HOY, creado_por=usuario.id, pago_id=pago.id,
    )
    db.flush()
    return pago


class TestElCobroNoSeBorra:
    def test_el_delete_ya_no_existe(self, client, cobro):
        r = client.delete(f"{API}/pagos/{cobro.id}")
        assert r.status_code == 410, (
            "410 y no 404: el pago existe, la operación no"
        )
        assert "anular" in r.json()["detail"]
        assert db_tiene_el_pago(client, cobro)

    def test_dar_de_baja_deja_la_fila_y_revierte_el_credito(self, client, db, cliente, cobro):
        cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente.id).one()
        assert Decimal(str(cc.saldo)) == Decimal("-100000")

        r = client.post(f"{API}/pagos/{cobro.id}/anular",
                        json={"motivo": "se cargó dos veces la misma transferencia"})
        assert r.status_code == 200

        assert db.query(Pago).filter_by(id=cobro.id).one().anulado is True
        assert cobro.motivo_anulacion == "se cargó dos veces la misma transferencia"
        assert cobro.anulado_por is not None
        assert cobro.anulado_en is not None

        db.refresh(cc)
        assert Decimal(str(cc.saldo)) == Decimal("0"), "el crédito se revirtió"
        # Con un contra-asiento, no editando el original.
        movs = db.query(MovimientoCuentaCorriente).all()
        assert len(movs) == 2
        assert movs[0].anulado is True
        assert movs[1].naturaleza == "anulacion"

    def test_sin_motivo_no_se_puede(self, client, cobro):
        r = client.post(f"{API}/pagos/{cobro.id}/anular", json={"motivo": "   "})
        assert r.status_code == 422

    def test_no_se_puede_dar_de_baja_dos_veces(self, client, cobro):
        client.post(f"{API}/pagos/{cobro.id}/anular", json={"motivo": "error de carga"})
        r = client.post(f"{API}/pagos/{cobro.id}/anular", json={"motivo": "otra vez"})
        assert r.status_code == 409

    def test_un_cobro_dado_de_baja_sale_de_la_caja_de_su_fecha(
        self, client, db, cliente, cobro
    ):
        antes = client.get(f"{API}/pagos/caja/dia", params={"fecha": HOY.isoformat()})
        assert antes.json()["data"]["total_ingresos"] == 100_000

        client.post(f"{API}/pagos/{cobro.id}/anular", json={"motivo": "error de carga"})

        despues = client.get(f"{API}/pagos/caja/dia", params={"fecha": HOY.isoformat()})
        assert despues.json()["data"]["total_ingresos"] == 0
        assert despues.json()["data"]["cobros"] == []

    def test_y_deja_de_contar_para_el_efectivo_del_cajon(self, client, db, cobro):
        assert CajaService(db).efectivo_acumulado() == Decimal("100000")
        client.post(f"{API}/pagos/{cobro.id}/anular", json={"motivo": "error de carga"})
        db.expire_all()
        assert CajaService(db).efectivo_acumulado() == Decimal("0")


def db_tiene_el_pago(client, pago) -> bool:
    """El 410 no puede haber borrado nada por las dudas."""
    r = client.get(f"{API}/pagos", params={"cliente_id": pago.cliente_id})
    return any(p["id"] == pago.id for p in r.json()["data"])


class TestElGastoNoSeBorra:
    @pytest.fixture()
    def gasto(self, db, vehiculo):
        g = Gasto(
            vehiculo_id=vehiculo.id, tipo="combustible",
            descripcion="Nafta súper", monto=Decimal("50000"),
            medio_pago="efectivo", fecha=HOY,
        )
        db.add(g)
        db.flush()
        return g

    def test_el_delete_ya_no_existe(self, client, gasto):
        r = client.delete(f"{API}/gastos/{gasto.id}")
        assert r.status_code == 410
        assert "anular" in r.json()["detail"]

    def test_dar_de_baja_lo_saca_de_los_totales_pero_deja_la_fila(
        self, client, db, gasto
    ):
        assert CajaService(db).efectivo_acumulado() == Decimal("-50000")

        r = client.post(f"{API}/gastos/{gasto.id}/anular",
                        json={"motivo": "el ticket era de otro auto"})
        assert r.status_code == 200

        db.expire_all()
        assert db.query(Gasto).filter_by(id=gasto.id).one().anulado is True
        assert CajaService(db).efectivo_acumulado() == Decimal("0")

    def test_sin_motivo_no_se_puede(self, client, gasto):
        r = client.post(f"{API}/gastos/{gasto.id}/anular", json={"motivo": ""})
        assert r.status_code == 422


class TestEditarUnGastoDejaRastro:
    @pytest.fixture()
    def gasto(self, db, vehiculo):
        g = Gasto(
            vehiculo_id=vehiculo.id, tipo="combustible",
            descripcion="Nafta súper", monto=Decimal("50000"),
            medio_pago="efectivo", fecha=HOY,
        )
        db.add(g)
        db.flush()
        return g

    def test_cambiar_el_monto_se_audita(self, db, usuario, gasto):
        from app.models.auditoria import Auditoria
        from app.schemas.gasto import GastoUpdate

        GastoService(db).update(
            gasto.id, GastoUpdate(monto=Decimal("90000")), usuario_id=usuario.id
        )

        auditorias = db.query(Auditoria).filter_by(entidad_tipo="gasto").all()
        assert len(auditorias) == 1
        assert "50000" in auditorias[0].descripcion
        assert "90000" in auditorias[0].descripcion

    def test_corregir_la_descripcion_no_llena_el_libro(self, db, usuario, gasto):
        """
        Se audita **sólo lo que mueve plata**. Llenar la auditoría con faltas de
        ortografía corregidas es la forma más rápida de que nadie la mire.
        """
        from app.models.auditoria import Auditoria
        from app.schemas.gasto import GastoUpdate

        GastoService(db).update(
            gasto.id, GastoUpdate(descripcion="Nafta súper (YPF)"), usuario_id=usuario.id
        )

        assert db.query(Auditoria).filter_by(entidad_tipo="gasto").count() == 0
