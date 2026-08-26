"""
Cobrar con medio "Cuenta Corriente" no cancela la deuda.

**Es el nombre más intuitivo para "todavía no me pagó, anotámelo".** Y era
exactamente lo que NO hacía: el sistema asentaba un `credito` en la cuenta
corriente, o sea borraba el saldo que venía a registrar.

El efecto era doble y ninguna de las dos mitades se veía enseguida:

  · la ficha del cliente mostraba la cuenta en cero;
  · el alquiler salía de `alquileres_con_saldo_pendiente` y **dejaba de
    generar avisos de deuda para siempre**.

La plata quedaba sin reclamar y sin que nada lo señalara. El medio está
ofrecido en cinco pantallas del panel.
"""
from decimal import Decimal

import pytest

from app.services.caja_service import es_plata_que_entro
from app.services.cobranza_service import monto_cobrado


class TestQuePlataEntro:
    @pytest.mark.parametrize(
        "medio", ["efectivo", "transferencia", "tarjeta", "cheque", "echeq",
                  "mercado_pago", "wapa"],
    )
    def test_los_medios_reales_son_plata(self, medio):
        assert es_plata_que_entro(medio) is True

    def test_cuenta_corriente_no_es_plata(self):
        assert es_plata_que_entro("cuenta_corriente") is False


class TestElSaldoSigueAhi:
    def _armar(self, db, usuario, hacer_reserva, hacer_alquiler, medio):
        from app.models.pago import Pago
        from datetime import date

        reserva = hacer_reserva(precio_total="100000", estado="activa")
        alquiler = hacer_alquiler(reserva)
        db.add(Pago(
            alquiler_id=alquiler.id, cliente_id=reserva.cliente_id,
            monto=Decimal("100000"), medio_pago=medio, con_factura=False,
            cobrado_por=usuario.id, fecha=date.today(),
        ))
        db.flush()
        db.refresh(alquiler)
        return alquiler

    def test_cobrar_en_efectivo_cancela_la_deuda(
        self, db, usuario, hacer_reserva, hacer_alquiler
    ):
        alquiler = self._armar(db, usuario, hacer_reserva, hacer_alquiler, "efectivo")
        assert monto_cobrado(db, alquiler) == Decimal("100000")

    def test_anotarlo_en_la_cuenta_NO_cancela_la_deuda(
        self, db, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        El caso del bug: el operador anota el cobro en la cuenta corriente y el
        alquiler figuraba como cobrado. Tiene que seguir debiendo los $100.000.
        """
        alquiler = self._armar(db, usuario, hacer_reserva, hacer_alquiler, "cuenta_corriente")
        assert monto_cobrado(db, alquiler) == Decimal("0")

    def test_y_por_eso_sigue_reclamandose(
        self, db, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        La mitad que menos se ve: si el alquiler sale de esta lista, deja de
        generar avisos de deuda **para siempre**.
        """
        from app.services.cobranza_service import alquileres_con_saldo_pendiente

        alquiler = self._armar(db, usuario, hacer_reserva, hacer_alquiler, "cuenta_corriente")
        assert alquiler.id in alquileres_con_saldo_pendiente(db)

    def test_la_fila_del_pago_igual_queda(
        self, db, usuario, hacer_reserva, hacer_alquiler
    ):
        """
        No se cobra, pero sí se registra: la constancia de que alguien tomó esa
        decisión y cuándo es lo que después permite explicar por qué el saldo
        sigue ahí.
        """
        from app.models.pago import Pago

        alquiler = self._armar(db, usuario, hacer_reserva, hacer_alquiler, "cuenta_corriente")
        pagos = db.query(Pago).filter(Pago.alquiler_id == alquiler.id).all()
        assert len(pagos) == 1
        assert pagos[0].medio_pago == "cuenta_corriente"
