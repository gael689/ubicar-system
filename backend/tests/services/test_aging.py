"""
El aging deja de vivir en la pantalla, y deja de mentir hacia arriba.

`PLAN_DINERO.md` §7 y §4.3. El aging se calculaba en `CuentaCorrienteTab.tsx`:
la pantalla iteraba los movimientos y sumaba por tramo. Eso rompía la regla que
gobierna todo el circuito —ninguna pantalla calcula un saldo por su cuenta— y
daba mal por dos motivos que el frontend no podía ver.

**Es aproximado a propósito.** Sin imputación crédito→débito el sistema sabe
cuánto debe un cliente, no qué débito suyo está impago. Lo que se hace para que
la aproximación no mienta demasiado está probado acá.
"""
from datetime import date, timedelta
from decimal import Decimal

from app.services.aging_service import AgingService
from app.services.cuenta_corriente_service import CuentaCorrienteService

HOY = date(2026, 8, 20)


def _debito(db, cliente, usuario, monto, dias_vencido, **kw):
    """Un débito vencido hace N días (negativo = todavía no venció)."""
    return CuentaCorrienteService(db).registrar_movimiento(
        cliente_id=cliente.id,
        tipo="debito",
        naturaleza=kw.pop("naturaleza", "alquiler"),
        concepto=kw.pop("concepto", "Alquiler"),
        monto=Decimal(str(monto)),
        fecha=HOY - timedelta(days=max(dias_vencido, 0) + 1),
        creado_por=usuario.id,
        fecha_vencimiento=HOY - timedelta(days=dias_vencido),
        **kw,
    )


class TestLosTramos:
    def test_cada_deuda_cae_en_su_tramo(self, db, cliente, usuario):
        _debito(db, cliente, usuario, "10000", dias_vencido=-5)   # no venció
        _debito(db, cliente, usuario, "20000", dias_vencido=10)
        _debito(db, cliente, usuario, "30000", dias_vencido=45)
        _debito(db, cliente, usuario, "40000", dias_vencido=75)
        _debito(db, cliente, usuario, "50000", dias_vencido=200)
        db.flush()

        a = AgingService(db).de_cliente(cliente.id, HOY)

        assert a["por_vencer"] == Decimal("10000")
        assert a["d0_30"] == Decimal("20000")
        assert a["d31_60"] == Decimal("30000")
        assert a["d61_90"] == Decimal("40000")
        assert a["d90mas"] == Decimal("50000")
        assert a["total_vencido"] == Decimal("140000")


class TestNoMienteHaciaArriba:
    def test_un_pago_a_cuenta_recorta_el_aging(self, db, cliente, usuario):
        """
        El error que tenía el del frontend: cada débito entraba por su monto
        bruto. Un cliente que debe $50.000 podía aparecer con $150.000 vencidos.
        """
        _debito(db, cliente, usuario, "100000", dias_vencido=45)
        _debito(db, cliente, usuario, "50000", dias_vencido=10)
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", naturaleza="pago",
            concepto="Pago a cuenta", monto=Decimal("100000"),
            fecha=HOY, creado_por=usuario.id,
        )
        db.flush()

        a = AgingService(db).de_cliente(cliente.id, HOY)

        assert a["deuda"] == Decimal("50000")
        assert a["total"] == Decimal("50000"), "el aging no puede superar la deuda real"
        # Se recorta desde lo más nuevo: lo que un pago cancela primero, cuando
        # nadie dijo lo contrario, es lo más reciente.
        assert a["d0_30"] == Decimal("0")
        assert a["d31_60"] == Decimal("50000")
        assert a["ajuste_por_pagos_sin_imputar"] == Decimal("100000")

    def test_un_alquiler_ya_cobrado_no_aporta_nada(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        """Mismo filtro que las notificaciones: si está cobrado, no es deuda."""
        reserva = hacer_reserva(precio_total="200000", estado="finalizada")
        alquiler = hacer_alquiler(reserva, checkout_fecha=HOY - timedelta(days=60))
        _debito(db, cliente, usuario, "200000", dias_vencido=45,
                alquiler_id=alquiler.id, reserva_id=reserva.id)
        pago = hacer_pago(cliente_id=cliente.id, monto="200000",
                          alquiler_id=alquiler.id, fecha=HOY - timedelta(days=60))
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", naturaleza="pago",
            concepto="Cobro", monto=Decimal("200000"), fecha=HOY,
            creado_por=usuario.id, alquiler_id=alquiler.id, pago_id=pago.id,
        )
        db.flush()

        a = AgingService(db).de_cliente(cliente.id, HOY)
        assert a["total"] == Decimal("0")
        assert a["total_vencido"] == Decimal("0")

    def test_un_vencimiento_provisorio_no_cuenta(self, db, cliente, usuario):
        """
        Esa fecha todavía puede correrse: clasificar una deuda como "vencida
        hace 45 días" apoyándose en una estimación es peor que no clasificarla.
        """
        mov = _debito(db, cliente, usuario, "200000", dias_vencido=45)
        mov.vencimiento_provisorio = True
        db.flush()

        a = AgingService(db).de_cliente(cliente.id, HOY)
        assert a["total_vencido"] == Decimal("0")


class TestElReporteGlobal:
    def test_suma_los_clientes_y_los_ordena_por_lo_mas_vencido(
        self, db, usuario, cliente
    ):
        from app.models.cliente import Cliente

        otro = Cliente(nombre_completo="Empresa Vieja SA", dni_cuit="30999888",
                       telefono="2915551111", tipo="empresa")
        db.add(otro)
        db.flush()

        _debito(db, cliente, usuario, "50000", dias_vencido=10)
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=otro.id, tipo="debito", naturaleza="alquiler",
            concepto="Alquiler viejo", monto=Decimal("300000"),
            fecha=HOY - timedelta(days=250), creado_por=usuario.id,
            fecha_vencimiento=HOY - timedelta(days=200),
        )
        db.flush()

        r = AgingService(db).global_(HOY)

        assert r["total_adeudado"] == Decimal("350000")
        assert r["tramos"]["d90mas"] == Decimal("300000")
        assert r["tramos"]["d0_30"] == Decimal("50000")
        assert r["clientes"][0]["cliente_nombre"] == "Empresa Vieja SA", (
            "lo más vencido primero: es el orden en el que hay que llamar"
        )

    def test_a_favor_se_mide_sobre_la_deuda_y_no_sobre_el_saldo(
        self, db, cliente, usuario, hacer_reserva
    ):
        """
        Un anticipo deja el saldo negativo y **no** es plata a favor del
        cliente: es un auto que le debemos entregar.
        """
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", naturaleza="anticipo",
            concepto="Seña", monto=Decimal("100000"), fecha=HOY,
            creado_por=usuario.id, reserva_id=reserva.id,
        )
        db.flush()

        r = AgingService(db).global_(HOY)
        assert r["clientes_a_favor"] == [], "tiene saldo negativo, no plata a favor"

    def test_un_cliente_con_plata_de_verdad_a_favor_si_aparece(
        self, db, cliente, usuario
    ):
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", naturaleza="pago",
            concepto="Pagó de más", monto=Decimal("75000"), fecha=HOY,
            creado_por=usuario.id,
        )
        db.flush()

        r = AgingService(db).global_(HOY)
        assert len(r["clientes_a_favor"]) == 1
        assert r["clientes_a_favor"][0]["a_favor"] == Decimal("75000")
