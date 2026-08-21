"""
Extender un alquiler asienta la diferencia en la cuenta corriente.

`PLAN_DINERO.md` §3.3b: `extender` pisaba `reserva.precio_total` y **no
reasentaba nada**. El débito del check-out se quedaba con el importe viejo, así
que la deuda del cliente quedaba corta por la diferencia, para siempre, y el
ledger se contradecía con la caja después de toda extensión.

Decisión 5 del dueño: el cliente paga la diferencia **al devolver**, salvo que
el operador decida cobrarla en el momento. Por eso se asienta un **débito
nuevo** —no un contra-asiento más un débito completo, que perdería el historial
de lo pactado primero— y el cobro es opcional en el mismo acto.
"""
from datetime import date, time
from decimal import Decimal

from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.pago import Pago
from app.schemas.alquiler import PagoInmediato
from app.services.alquiler_service import AlquilerService
from app.services.cuenta_corriente_service import CuentaCorrienteService

CHECKOUT = date(2026, 9, 1)


def _saldo(db, cliente_id):
    cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente_id).first()
    return Decimal(str(cc.saldo)) if cc else Decimal("0")


def _alquiler_con_debito(db, cliente, usuario, hacer_reserva, hacer_alquiler, monto="400000"):
    reserva = hacer_reserva(precio_total=monto, estado="activa")
    alquiler = hacer_alquiler(reserva)
    CuentaCorrienteService(db).registrar_movimiento(
        cliente_id=cliente.id, tipo="debito", naturaleza="alquiler",
        concepto=f"Alquiler #{reserva.id} — checkout", monto=Decimal(monto),
        fecha=CHECKOUT, creado_por=usuario.id, condicion="contado",
        alquiler_id=alquiler.id, reserva_id=reserva.id,
    )
    db.flush()
    return reserva, alquiler


class TestExtenderSubiendoElPrecio:
    def test_asienta_un_debito_por_la_diferencia_y_no_reasienta_todo(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        assert _saldo(db, cliente.id) == Decimal("400000")

        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=date(2026, 9, 8),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_manual=Decimal("550000"),
        )
        db.flush()

        assert _saldo(db, cliente.id) == Decimal("550000")

        movs = db.query(MovimientoCuentaCorriente).order_by(MovimientoCuentaCorriente.id).all()
        assert len(movs) == 2, "el débito original más el de la extensión, nada más"
        assert movs[0].naturaleza == "alquiler"
        assert movs[0].anulado is False, (
            "el débito de lo pactado primero no se anula: se pierde el historial"
        )
        assert movs[1].naturaleza == "extension"
        assert Decimal(str(movs[1].monto)) == Decimal("150000")
        assert movs[1].alquiler_id == alquiler.id

    def test_el_cobro_en_el_acto_es_opcional_y_no_cambia_el_debito(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )

        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=date(2026, 9, 8),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_manual=Decimal("550000"),
            pago_inmediato=PagoInmediato(
                monto=Decimal("150000"), medio_pago="efectivo", fecha=CHECKOUT
            ),
        )
        db.flush()

        # El débito de la extensión sigue estando; lo que cambia es que además
        # entró la plata.
        assert _saldo(db, cliente.id) == Decimal("400000")
        pago = db.query(Pago).one()
        assert Decimal(str(pago.monto)) == Decimal("150000")
        assert pago.alquiler_id == alquiler.id
        assert pago.fecha == CHECKOUT

    def test_sin_cobrar_no_crea_ningun_pago(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """El default: la diferencia se paga al devolver."""
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=date(2026, 9, 8),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_manual=Decimal("550000"),
        )
        db.flush()

        assert db.query(Pago).count() == 0


class TestExtenderSinCambiarElPrecio:
    def test_no_asienta_nada(self, db, cliente, usuario, hacer_reserva, hacer_alquiler):
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=date(2026, 9, 8),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_manual=Decimal("400000"),
        )
        db.flush()

        assert db.query(MovimientoCuentaCorriente).count() == 1


class TestExtenderBajandoElPrecio:
    def test_asienta_el_credito_en_vez_de_dejarlo_pasar(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        Raro pero posible: se extiende y se pacta un precio manual más bajo.
        Es deuda que se perdona, así que se asienta como bonificación en vez de
        quedar sólo en la diferencia entre dos campos.
        """
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=date(2026, 9, 8),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_manual=Decimal("350000"),
        )
        db.flush()

        assert _saldo(db, cliente.id) == Decimal("350000")
        credito = db.query(MovimientoCuentaCorriente).filter_by(tipo="credito").one()
        assert credito.naturaleza == "bonificacion"
        assert Decimal(str(credito.monto)) == Decimal("50000")
