"""
La caja del día contesta dónde está la plata, y deja de inflar el total.

`PLAN_DINERO.md` §4.4. Dos cosas distintas:

1. **El total del día estaba inflado.** `caja_dia` sumaba *todos* los `Pago`,
   y `medio_pago` incluye `cuenta_corriente`, que significa "se lo anotamos en
   la cuenta": plata que **no entró**. El total del día decía más de lo que
   había.

2. **Nadie sabía cuánto tendría que haber en el cajón.** `pagos` dice cuánto
   entró y `gastos` cuánto salió; el efectivo que se deposita, el que alguien
   retira y la garantía que se guarda no tenían dónde registrarse.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.models.gasto import Gasto
from app.models.movimiento_caja import MovimientoCaja
from app.services.caja_service import CajaService

HOY = date(2026, 9, 10)
API = "/api/v1"


class TestElTotalDelDia:
    def test_no_cuenta_los_cobros_anotados_en_cuenta_corriente(
        self, client, db, cliente, hacer_pago
    ):
        hacer_pago(cliente_id=cliente.id, monto="100000", medio_pago="efectivo", fecha=HOY)
        hacer_pago(cliente_id=cliente.id, monto="50000", medio_pago="transferencia", fecha=HOY)
        # Este no es plata: es una anotación en la cuenta del cliente.
        hacer_pago(cliente_id=cliente.id, monto="300000", medio_pago="cuenta_corriente", fecha=HOY)
        db.flush()

        d = client.get(f"{API}/pagos/caja/dia", params={"fecha": HOY.isoformat()}).json()["data"]

        assert d["total_ingresos"] == 150_000, "antes decía 450.000"
        assert d["total_a_cuenta"] == 300_000, "no desaparece: se muestra aparte"
        # El desglose por medio los sigue mostrando: son cobros reales.
        assert d["por_medio_pago"]["cuenta_corriente"] == 300_000


class TestElEfectivoDelCajon:
    def test_suma_los_cobros_en_efectivo_y_resta_los_gastos(
        self, db, cliente, usuario, hacer_pago
    ):
        hacer_pago(cliente_id=cliente.id, monto="100000", medio_pago="efectivo", fecha=HOY)
        # Una transferencia entra a una cuenta bancaria, no al cajón.
        hacer_pago(cliente_id=cliente.id, monto="500000", medio_pago="transferencia", fecha=HOY)
        db.flush()

        assert CajaService(db).efectivo_acumulado() == Decimal("100000")

    def test_el_deposito_al_banco_lo_baja(self, db, cliente, usuario, hacer_pago):
        hacer_pago(cliente_id=cliente.id, monto="100000", medio_pago="efectivo", fecha=HOY)
        db.flush()

        CajaService(db).registrar(
            tipo="deposito_banco", monto=Decimal("80000"), medio="efectivo",
            motivo="depósito semanal", fecha=HOY, creado_por=usuario.id,
        )
        db.flush()

        assert CajaService(db).efectivo_acumulado() == Decimal("20000")

    def test_la_garantia_en_efectivo_entra_y_sale(self, db, usuario):
        svc = CajaService(db)
        svc.registrar(tipo="garantia_recibida", monto=Decimal("200000"), medio="efectivo",
                      motivo="garantía del alquiler #1", fecha=HOY, creado_por=usuario.id)
        db.flush()
        assert svc.efectivo_acumulado() == Decimal("200000")

        svc.registrar(tipo="garantia_devuelta", monto=Decimal("200000"), medio="efectivo",
                      motivo="devuelta sin daños", fecha=HOY, creado_por=usuario.id)
        db.flush()
        assert svc.efectivo_acumulado() == Decimal("0")

    def test_un_movimiento_anulado_deja_de_contar(self, db, usuario):
        svc = CajaService(db)
        mov = svc.registrar(tipo="garantia_recibida", monto=Decimal("200000"), medio="efectivo",
                            motivo="garantía", fecha=HOY, creado_por=usuario.id)
        db.flush()
        svc.anular(mov.id, "se cargó dos veces", usuario.id)
        db.flush()

        assert svc.efectivo_acumulado() == Decimal("0")


class TestLaFechaDelUltimoDeposito:
    def test_sin_depositos_lo_dice_en_vez_de_mostrar_un_numero_solo(self, db, cliente, hacer_pago):
        """
        Mostrar "hay $850.000 en el cajón" sin decir desde cuándo se viene
        acumulando convierte un número viejo en una afirmación falsa.
        """
        hacer_pago(cliente_id=cliente.id, monto="850000", medio_pago="efectivo", fecha=HOY)
        db.flush()

        d = CajaService(db).donde_esta_la_plata()
        assert d["efectivo_sin_depositar"] == Decimal("850000")
        assert d["sin_depositos_cargados"] is True
        assert d["ultimo_deposito_fecha"] is None

    def test_con_depositos_devuelve_el_ultimo(self, db, usuario, cliente, hacer_pago):
        hacer_pago(cliente_id=cliente.id, monto="500000", medio_pago="efectivo", fecha=HOY)
        svc = CajaService(db)
        svc.registrar(tipo="deposito_banco", monto=Decimal("100000"), medio="efectivo",
                      motivo="depósito", fecha=date(2026, 9, 1), creado_por=usuario.id)
        svc.registrar(tipo="deposito_banco", monto=Decimal("200000"), medio="efectivo",
                      motivo="depósito", fecha=date(2026, 9, 8), creado_por=usuario.id)
        db.flush()

        d = svc.donde_esta_la_plata()
        assert d["ultimo_deposito_fecha"] == date(2026, 9, 8)
        assert d["ultimo_deposito_monto"] == Decimal("200000")
        assert d["efectivo_sin_depositar"] == Decimal("200000")
        assert d["sin_depositos_cargados"] is False


class TestLoQueNoSePuedeCargar:
    def test_sin_motivo_no_entra(self, client, usuario):
        r = client.post(f"{API}/pagos/caja/movimientos", json={
            "tipo": "deposito_banco", "monto": 100000, "medio": "efectivo",
            "motivo": "   ", "fecha": HOY.isoformat(),
        })
        assert r.status_code == 422

    def test_un_monto_negativo_no_entra(self, client):
        """El signo lo define el tipo. Un monto negativo sería una segunda
        forma de decir lo mismo, y dos formas terminan discrepando."""
        r = client.post(f"{API}/pagos/caja/movimientos", json={
            "tipo": "retiro", "monto": -5000, "medio": "efectivo",
            "motivo": "prueba", "fecha": HOY.isoformat(),
        })
        assert r.status_code == 422

    def test_el_reembolso_no_entra_como_movimiento_suelto(self, client):
        """
        Devolverle plata a un cliente también revierte su cuenta corriente.
        Hacer sólo una de las dos cosas deja el libro contradiciendo a la caja.
        """
        r = client.post(f"{API}/pagos/caja/movimientos", json={
            "tipo": "reembolso", "monto": 50000, "medio": "efectivo",
            "motivo": "se canceló", "fecha": HOY.isoformat(),
        })
        assert r.status_code == 422
        assert "cuenta" in r.json()["detail"].lower()

    def test_anular_sin_motivo_no_entra(self, client, db, usuario):
        mov = CajaService(db).registrar(
            tipo="retiro", monto=Decimal("10000"), medio="efectivo",
            motivo="adelanto", fecha=HOY, creado_por=usuario.id,
        )
        db.flush()
        r = client.post(f"{API}/pagos/caja/movimientos/{mov.id}/anular", json={"motivo": ""})
        assert r.status_code == 422
