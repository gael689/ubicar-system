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

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.alquiler import Alquiler
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


class TestLaExtensionTraeSuPropioPrecio:
    """
    Pedido del mostrador (27/09): la extensión es un alquiler nuevo. Se carga
    el precio de los días que se agregan —no el total— y se asienta sólo eso.
    """

    def test_precio_extension_suma_al_anterior_y_debita_solo_la_extension(
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
            precio_extension=Decimal("90000"),
        )
        db.flush()
        db.refresh(reserva)

        assert Decimal(str(reserva.precio_total)) == Decimal("490000")
        ext = db.query(MovimientoCuentaCorriente).filter_by(naturaleza="extension").one()
        assert Decimal(str(ext.monto)) == Decimal("90000")
        assert _saldo(db, cliente.id) == Decimal("490000")

    def test_sin_precio_no_se_extiende(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        Antes, sin precio, se re-cotizaba el período entero y una banda más
        barata terminaba en una bonificación que nadie había decidido.
        """
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        with pytest.raises(BusinessRuleError):
            AlquilerService(db).extender(
                alquiler_id=alquiler.id,
                nueva_fecha_fin=date(2026, 9, 8),
                nueva_hora_fin=time(10, 0),
                usuario_id=usuario.id,
            )
        assert db.query(MovimientoCuentaCorriente).count() == 1

    def test_precio_cero_no_se_acepta(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        with pytest.raises(BusinessRuleError):
            AlquilerService(db).extender(
                alquiler_id=alquiler.id,
                nueva_fecha_fin=date(2026, 9, 8),
                nueva_hora_fin=time(10, 0),
                usuario_id=usuario.id,
                precio_extension=Decimal("0"),
            )

    def test_anotar_en_la_cuenta_no_cancela_la_extension(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        """`cuenta_corriente` no es plata que entró: la deuda de la extensión queda."""
        reserva, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        AlquilerService(db).extender(
            alquiler_id=alquiler.id,
            nueva_fecha_fin=date(2026, 9, 8),
            nueva_hora_fin=time(10, 0),
            usuario_id=usuario.id,
            precio_extension=Decimal("90000"),
            pago_inmediato=PagoInmediato(
                monto=Decimal("90000"), medio_pago="cuenta_corriente", fecha=CHECKOUT
            ),
        )
        db.flush()

        assert _saldo(db, cliente.id) == Decimal("490000")


class TestEndpointExtender:
    API = "/api/v1"

    def test_sin_precio_devuelve_422(
        self, client, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        _, alquiler = _alquiler_con_debito(
            db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000"
        )
        r = client.patch(
            f"{self.API}/alquileres/{alquiler.id}/extender",
            json={"nueva_fecha_fin": "2026-09-08", "nueva_hora_fin": "10:00:00"},
        )
        assert r.status_code == 422

    def test_devuelve_solo_lo_de_la_extension(
        self, client, db, cliente, usuario, hacer_reserva, hacer_alquiler
    ):
        # La reserva de la fábrica va del 01/09 al 05/09.
        _alquiler_con_debito(db, cliente, usuario, hacer_reserva, hacer_alquiler, "400000")
        alquiler = db.query(Alquiler).one()
        r = client.patch(
            f"{self.API}/alquileres/{alquiler.id}/extender",
            json={
                "nueva_fecha_fin": "2026-09-07",
                "nueva_hora_fin": "10:00:00",
                "precio_extension": "80000",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert Decimal(str(data["precio_extension"])) == Decimal("80000")
        assert data["dias_agregados"] == 2
