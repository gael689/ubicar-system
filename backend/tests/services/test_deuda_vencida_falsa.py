"""
El alquiler al contado cobrado íntegro no genera avisos de deuda.

`PLAN_DINERO.md` §1.1: `cc_vencida` y `cc_vencimiento_proximo` listaban **todo**
débito vencido, sin mirar si estaba pago — no podían mirarlo, porque el sistema
no tiene imputación crédito→débito. Y con condición `contado` el vencimiento es
**el mismo día del movimiento**. Resultado: el caso más común del negocio
—alquiler al contado, cobrado en el mostrador— disparaba "vence hoy" ese mismo
día y "deuda vencida" el siguiente, para siempre.

El arreglo es el filtro por alquiler de §4.3: un débito con `alquiler_id` sólo
se considera si a ese alquiler le falta plata.
"""
from datetime import date, timedelta
from decimal import Decimal

from app.domain.notificaciones_reglas import cc_vencida, cc_vencimiento_proximo
from app.services.cuenta_corriente_service import CuentaCorrienteService

CHECKOUT = date(2026, 9, 1)


def _debitar_alquiler(db, *, cliente_id, alquiler, reserva, monto, usuario_id):
    return CuentaCorrienteService(db).registrar_movimiento(
        cliente_id=cliente_id,
        tipo="debito",
        concepto=f"Alquiler #{reserva.id} — checkout",
        monto=Decimal(str(monto)),
        fecha=CHECKOUT,
        creado_por=usuario_id,
        condicion="contado",
        alquiler_id=alquiler.id,
        reserva_id=reserva.id,
    )


def _acreditar_cobro(db, *, cliente_id, alquiler, reserva, monto, pago, usuario_id):
    return CuentaCorrienteService(db).registrar_movimiento(
        cliente_id=cliente_id,
        tipo="credito",
        concepto="Cobro en checkout",
        monto=Decimal(str(monto)),
        fecha=CHECKOUT,
        creado_por=usuario_id,
        alquiler_id=alquiler.id,
        reserva_id=reserva.id,
        pago_id=pago.id,
    )


class TestCheckoutContadoCobradoIntegro:
    def test_no_avisa_ni_ese_dia_ni_al_siguiente(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        reserva = hacer_reserva(precio_total="100000", estado="activa")
        alquiler = hacer_alquiler(reserva)
        _debitar_alquiler(db, cliente_id=cliente.id, alquiler=alquiler,
                          reserva=reserva, monto="100000", usuario_id=usuario.id)
        pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                          alquiler_id=alquiler.id, fecha=CHECKOUT)
        _acreditar_cobro(db, cliente_id=cliente.id, alquiler=alquiler,
                         reserva=reserva, monto="100000", pago=pago,
                         usuario_id=usuario.id)
        db.flush()

        # El mismo día: el débito contado vence hoy.
        assert cc_vencimiento_proximo(db, CHECKOUT) == []
        # Y al día siguiente, que es cuando aparecía la falsa deuda vencida.
        assert cc_vencida(db, CHECKOUT + timedelta(days=1)) == []
        # Y treinta días después, que es cuando escalaba a crítica.
        assert cc_vencida(db, CHECKOUT + timedelta(days=31)) == []

    def test_si_falta_plata_el_aviso_sigue_saliendo(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        """La contracara: el filtro no puede apagar la alerta que sí importa."""
        reserva = hacer_reserva(precio_total="100000", estado="activa")
        alquiler = hacer_alquiler(reserva)
        _debitar_alquiler(db, cliente_id=cliente.id, alquiler=alquiler,
                          reserva=reserva, monto="100000", usuario_id=usuario.id)
        pago = hacer_pago(cliente_id=cliente.id, monto="40000",
                          alquiler_id=alquiler.id, fecha=CHECKOUT)
        _acreditar_cobro(db, cliente_id=cliente.id, alquiler=alquiler,
                         reserva=reserva, monto="40000", pago=pago,
                         usuario_id=usuario.id)
        db.flush()

        avisos = cc_vencida(db, CHECKOUT + timedelta(days=1))
        assert len(avisos) == 1
        assert avisos[0]["tipo"] == "cc_vencida"


class TestClienteConDosAlquileres:
    def test_solo_avisa_por_el_impago_y_por_su_monto(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        """
        El contraejemplo que tiró abajo el filtro por cliente
        (`PLAN_DINERO.md` §4.3): con el filtro por cliente, un cliente con un
        alquiler impago recibía avisos por **los dos**, porque el bucle itera
        movimientos y no clientes. Con el filtro por alquiler, no.
        """
        # A: pagado íntegro.
        reserva_a = hacer_reserva(precio_total="200000", estado="finalizada",
                                  fecha_inicio=date(2026, 8, 1), fecha_fin=date(2026, 8, 5))
        alq_a = hacer_alquiler(reserva_a, checkout_fecha=date(2026, 8, 1))
        _debitar_alquiler(db, cliente_id=cliente.id, alquiler=alq_a,
                          reserva=reserva_a, monto="200000", usuario_id=usuario.id)
        pago_a = hacer_pago(cliente_id=cliente.id, monto="200000",
                            alquiler_id=alq_a.id, fecha=date(2026, 8, 1))
        _acreditar_cobro(db, cliente_id=cliente.id, alquiler=alq_a, reserva=reserva_a,
                         monto="200000", pago=pago_a, usuario_id=usuario.id)

        # B: impago.
        reserva_b = hacer_reserva(precio_total="300000", estado="activa")
        alq_b = hacer_alquiler(reserva_b)
        _debitar_alquiler(db, cliente_id=cliente.id, alquiler=alq_b,
                          reserva=reserva_b, monto="300000", usuario_id=usuario.id)
        db.flush()

        avisos = cc_vencida(db, CHECKOUT + timedelta(days=2))

        assert len(avisos) == 1, "el alquiler A está pago y no tiene que avisar"
        assert f"#{reserva_b.id}" in avisos[0]["descripcion"]
        assert "300000" in avisos[0]["descripcion"]
        assert "200000" not in avisos[0]["descripcion"]


class TestMovimientosSinAlquiler:
    def test_una_multa_impaga_sigue_avisando(self, db, cliente, usuario):
        """
        Los movimientos que no cuelgan de ningún alquiler caen al filtro por
        cliente. Con deuda real, el aviso sale.
        """
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id,
            tipo="debito",
            concepto="Multa #1 — AB123CD",
            monto=Decimal("50000"),
            fecha=CHECKOUT,
            creado_por=usuario.id,
            condicion="contado",
        )
        db.flush()

        avisos = cc_vencida(db, CHECKOUT + timedelta(days=1))
        assert len(avisos) == 1
        assert "Multa #1" in avisos[0]["descripcion"]

    def test_una_multa_ya_cobrada_deja_de_avisar(self, db, cliente, usuario):
        svc = CuentaCorrienteService(db)
        svc.registrar_movimiento(
            cliente_id=cliente.id, tipo="debito", concepto="Multa #1 — AB123CD",
            monto=Decimal("50000"), fecha=CHECKOUT, creado_por=usuario.id,
            condicion="contado",
        )
        svc.registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", concepto="Multa #1 cobrada",
            monto=Decimal("50000"), fecha=CHECKOUT, creado_por=usuario.id,
        )
        db.flush()

        assert cc_vencida(db, CHECKOUT + timedelta(days=1)) == []
