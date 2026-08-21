"""
El alquiler pagado por la web deja de reclamar la seña que ya cobró.

`PLAN_DINERO.md` §1.5.a: `PagoWebService._acreditar` crea el `Pago` con
`alquiler_id=None` —correcto, el alquiler todavía no existe— y ningún código lo
completaba después. El check-out sí completa el vínculo de los echeqs y del
contrato, pero no el del pago.

Como todo lo que pregunta "cuánto se cobró de este alquiler" suma
`alquiler.pagos`, ese alquiler figuraba con saldo pendiente inflado por el
monto de la seña online **para siempre**, en la caja (`/pagos/pendientes`) y en
la notificación `saldo_pendiente_alquiler`.
"""
from datetime import date
from decimal import Decimal

from app.models.pago_web import PagoWeb
from app.services import cobranza_service as cobranza
from app.domain.notificaciones_reglas import saldo_pendiente_al_finalizar


def _pago_web(db, reserva, pago, monto):
    pw = PagoWeb(
        reserva_id=reserva.id,
        preference_id=f"pref-{reserva.id}",
        payment_id=f"mp-{reserva.id}",
        monto=Decimal(str(monto)),
        porcentaje_anticipo=25,
        total_reserva=Decimal(str(reserva.precio_total)),
        estado="aprobado",
        pago_id=pago.id,
    )
    db.add(pw)
    db.flush()
    return pw


class TestSaldoDeUnAlquilerPagadoOnline:
    def test_la_sena_online_cuenta_como_cobrada(
        self, db, cliente, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        reserva = hacer_reserva(precio_total="400000", estado="activa")
        # El cobro online: Pago suelto, sin alquiler_id (el alquiler no existía).
        pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                          medio_pago="mercado_pago", fecha=date(2026, 8, 20))
        alquiler = hacer_alquiler(reserva)
        _pago_web(db, reserva, pago, "100000")

        assert cobranza.monto_facturado(alquiler) == Decimal("400000")
        assert cobranza.monto_cobrado(db, alquiler) == Decimal("100000")
        assert cobranza.saldo_pendiente(db, alquiler) == Decimal("300000"), (
            "antes decía 400.000: reclamaba la seña ya cobrada"
        )

    def test_el_checkout_completa_el_vinculo(
        self, db, cliente, usuario, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        """
        Y además lo deja escrito en el `Pago`, para que cualquier consulta
        futura por `alquiler_id` lo encuentre sin pasar por `PagoWeb`.
        """
        from app.services.alquiler_service import AlquilerService

        reserva = hacer_reserva(precio_total="400000", estado="activa")
        pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                          medio_pago="mercado_pago", fecha=date(2026, 8, 20))
        alquiler = hacer_alquiler(reserva)
        _pago_web(db, reserva, pago, "100000")

        assert pago.alquiler_id is None
        AlquilerService(db)._completar_pago_online(reserva.id, alquiler.id)
        assert pago.alquiler_id == alquiler.id

    def test_no_se_cuenta_dos_veces_cuando_ya_esta_atado(
        self, db, cliente, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        reserva = hacer_reserva(precio_total="400000", estado="activa")
        alquiler = hacer_alquiler(reserva)
        pago = hacer_pago(cliente_id=cliente.id, monto="100000",
                          alquiler_id=alquiler.id, medio_pago="mercado_pago",
                          fecha=date(2026, 8, 20))
        _pago_web(db, reserva, pago, "100000")

        assert cobranza.monto_cobrado(db, alquiler) == Decimal("100000")

    def test_no_avisa_saldo_pendiente_si_la_web_lo_pago_entero(
        self, db, cliente, hacer_reserva, hacer_alquiler, hacer_pago
    ):
        reserva = hacer_reserva(
            precio_total="400000", estado="finalizada",
            fecha_inicio=date(2026, 8, 1), fecha_fin=date(2026, 8, 5),
        )
        pago = hacer_pago(cliente_id=cliente.id, monto="400000",
                          medio_pago="mercado_pago", fecha=date(2026, 7, 20))
        alquiler = hacer_alquiler(reserva, checkout_fecha=date(2026, 8, 1))
        _pago_web(db, reserva, pago, "400000")

        assert saldo_pendiente_al_finalizar(db, date(2026, 8, 10)) == []
