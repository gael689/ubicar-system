"""
La garantía entra y sale de la caja, y nunca del ledger.

`PLAN_DINERO.md` §5 y §1.5.d. La garantía **no estaba a medias por falta de
campos**: `Alquiler` ya tenía tipo, monto, estado y monto devuelto, y el
check-out y el check-in ya los escribían. Lo que faltaba era otra cosa.

- **No entraba a la caja.** Una garantía de $300.000 en efectivo se guardaba en
  el cajón y el sistema no lo sabía: al cerrar el día ese efectivo estaba de
  más y nadie podía explicar por qué.
- **`garantia_monto_devuelto` no se validaba** (§1.5.d): nada impedía devolver
  más de lo retenido, ni marcar `devuelta` con un monto parcial.
- **Faltaba `ejecutada_total`.** Existía `ejecutada_parcial` y no su hermana
  entera, así que quedarse con la garantía completa había que anotarlo como
  parcial con monto cero — un dato que dice lo contrario de lo que pasó.

Y lo que **no** cambia: D-27 sigue mandando. La garantía no genera ningún
movimiento en la cuenta corriente. No es plata que el cliente deba ni que se le
deba: es plata que se retiene.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.movimiento_caja import MovimientoCaja
from app.services.alquiler_service import AlquilerService
from app.services.caja_service import CajaService

CHECKOUT = date(2026, 8, 1)
CHECKIN = date(2026, 8, 5)


@pytest.fixture()
def con_garantia(db, cliente, usuario, hacer_reserva, hacer_alquiler):
    """Un alquiler con garantía en efectivo, sin pasar por `checkout()`."""
    def _hacer(tipo="efectivo", monto="300000"):
        reserva = hacer_reserva(precio_total="400000", estado="activa",
                                fecha_inicio=CHECKOUT, fecha_fin=CHECKIN)
        alquiler = hacer_alquiler(reserva, checkout_fecha=CHECKOUT)
        alquiler.garantia_tipo = tipo
        alquiler.garantia_monto = Decimal(monto) if monto else None
        alquiler.garantia_estado = "retenida"
        db.flush()
        return reserva, alquiler
    return _hacer


class TestLaGarantiaEntraALaCaja:
    def test_una_garantia_en_efectivo_suma_al_cajon(self, db, usuario, con_garantia):
        reserva, alquiler = con_garantia()
        svc = AlquilerService(db)

        svc._registrar_garantia_recibida(alquiler, reserva, CHECKOUT, usuario.id)
        db.flush()

        mov = db.query(MovimientoCaja).one()
        assert mov.tipo == "garantia_recibida"
        assert Decimal(str(mov.monto)) == Decimal("300000")
        assert mov.medio == "efectivo"
        assert alquiler.garantia_movimiento_caja_id == mov.id
        assert CajaService(db).efectivo_acumulado() == Decimal("300000")

    def test_una_garantia_en_tarjeta_no_mueve_nada(self, db, usuario, con_garantia):
        """
        Anotar una tarjeta no reserva fondos: no hay plata que entre a ningún
        lado. Ver `docs/ALTERNATIVAS_COBRO.md`.
        """
        reserva, alquiler = con_garantia(tipo="tarjeta")
        AlquilerService(db)._registrar_garantia_recibida(alquiler, reserva, CHECKOUT, usuario.id)
        db.flush()

        assert db.query(MovimientoCaja).count() == 0
        assert alquiler.garantia_movimiento_caja_id is None

    def test_no_toca_la_cuenta_corriente_nunca(self, db, usuario, con_garantia):
        """D-27, y es la regla que más fácil se rompe sin querer."""
        reserva, alquiler = con_garantia()
        AlquilerService(db)._registrar_garantia_recibida(alquiler, reserva, CHECKOUT, usuario.id)
        db.flush()

        assert db.query(MovimientoCuentaCorriente).count() == 0

    def test_registrarla_dos_veces_no_la_duplica(self, db, usuario, con_garantia):
        reserva, alquiler = con_garantia()
        svc = AlquilerService(db)
        svc._registrar_garantia_recibida(alquiler, reserva, CHECKOUT, usuario.id)
        db.flush()
        svc._registrar_garantia_recibida(alquiler, reserva, CHECKOUT, usuario.id)
        db.flush()

        assert db.query(MovimientoCaja).count() == 1


class TestDevolverla:
    def _con_garantia_en_caja(self, db, usuario, con_garantia, **kw):
        reserva, alquiler = con_garantia(**kw)
        AlquilerService(db)._registrar_garantia_recibida(alquiler, reserva, CHECKOUT, usuario.id)
        db.flush()
        return reserva, alquiler

    def test_devuelta_entera_saca_todo_del_cajon(self, db, usuario, con_garantia):
        reserva, alquiler = self._con_garantia_en_caja(db, usuario, con_garantia)
        svc = AlquilerService(db)

        devuelto = svc._resolver_garantia(
            alquiler, reserva, "devuelta", None, CHECKIN, usuario.id
        )
        db.flush()

        assert devuelto == Decimal("300000"), "'devuelta' sin monto significa el total"
        assert CajaService(db).efectivo_acumulado() == Decimal("0")

    def test_ejecutada_total_no_saca_nada(self, db, usuario, con_garantia):
        """La plata se queda. El daño que lo justifica se cobra por su camino."""
        reserva, alquiler = self._con_garantia_en_caja(db, usuario, con_garantia)

        devuelto = AlquilerService(db)._resolver_garantia(
            alquiler, reserva, "ejecutada_total", None, CHECKIN, usuario.id
        )
        db.flush()

        assert devuelto == Decimal("0")
        assert CajaService(db).efectivo_acumulado() == Decimal("300000")
        assert db.query(MovimientoCaja).filter_by(tipo="garantia_devuelta").count() == 0

    def test_ejecutada_parcial_saca_solo_lo_que_vuelve(self, db, usuario, con_garantia):
        reserva, alquiler = self._con_garantia_en_caja(db, usuario, con_garantia)

        devuelto = AlquilerService(db)._resolver_garantia(
            alquiler, reserva, "ejecutada_parcial", Decimal("200000"), CHECKIN, usuario.id
        )
        db.flush()

        assert devuelto == Decimal("200000")
        assert CajaService(db).efectivo_acumulado() == Decimal("100000")


class TestLoQueNoSePuedeHacer:
    """§1.5.d: `garantia_monto_devuelto` se escribía sin comparar con nada."""

    def test_no_se_puede_devolver_mas_de_lo_retenido(self, db, usuario, con_garantia):
        reserva, alquiler = con_garantia(monto="300000")
        with pytest.raises(BusinessRuleError):
            AlquilerService(db)._resolver_garantia(
                alquiler, reserva, "ejecutada_parcial", Decimal("400000"), CHECKIN, usuario.id
            )

    def test_devuelta_con_un_monto_parcial_no_pasa(self, db, usuario, con_garantia):
        """
        Decía "devuelta" y devolvía la mitad. Los dos datos no pueden ser
        ciertos a la vez, y el que quedaba escrito era el que mentía.
        """
        reserva, alquiler = con_garantia(monto="300000")
        with pytest.raises(BusinessRuleError):
            AlquilerService(db)._resolver_garantia(
                alquiler, reserva, "devuelta", Decimal("150000"), CHECKIN, usuario.id
            )

    def test_una_parcial_que_devuelve_todo_es_una_devolucion(self, db, usuario, con_garantia):
        reserva, alquiler = con_garantia(monto="300000")
        with pytest.raises(BusinessRuleError):
            AlquilerService(db)._resolver_garantia(
                alquiler, reserva, "ejecutada_parcial", Decimal("300000"), CHECKIN, usuario.id
            )

    def test_una_parcial_que_no_devuelve_nada_es_una_ejecucion_total(
        self, db, usuario, con_garantia
    ):
        reserva, alquiler = con_garantia(monto="300000")
        with pytest.raises(BusinessRuleError):
            AlquilerService(db)._resolver_garantia(
                alquiler, reserva, "ejecutada_parcial", Decimal("0"), CHECKIN, usuario.id
            )

    def test_no_se_devuelve_plata_de_una_garantia_que_sigue_retenida(
        self, db, usuario, con_garantia
    ):
        reserva, alquiler = con_garantia(monto="300000")
        with pytest.raises(BusinessRuleError):
            AlquilerService(db)._resolver_garantia(
                alquiler, reserva, "retenida", Decimal("100000"), CHECKIN, usuario.id
            )
