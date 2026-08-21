"""
Devolver plata mueve las dos mitades, y perdonar deuda no es corregir un error.

`PLAN_DINERO.md` Fase 3. Tres cosas:

1. **El reembolso.** Estaba prometido en §3.1 y §4.1 como "egreso de caja" y no
   tenía dónde guardarse. Ahora existe, y hace las dos mitades juntas: la plata
   sale de la caja y el libro deja de decir que entró.
2. **"Cancela Ubicar" (D-11).** La única excepción a "la seña no se devuelve":
   si el que no puede cumplir es Ubicar Rent, se reintegra el 100%. Sin flujo
   propio — el dueño estimó que pasa una vez por año.
3. **La bonificación deja de contarse como anulación.** Las dos hacen lo mismo
   con la plata; la diferencia es que sumar las bonificaciones de un mes
   contesta *cuánto regalamos* y sumar las anulaciones contesta *cuánto nos
   equivocamos*.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.movimiento_caja import MovimientoCaja
from app.models.multa import Multa
from app.schemas.multa import MultaUpdate
from app.services.caja_service import CajaService
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.multa_service import MultaService
from app.services.reserva_service import ReservaService

# Una fecha pasada: `registrar_cobro` rechaza los cobros con fecha futura —la
# plata se carga cuando entró—, y el suite no puede depender de en qué día se
# corre.
HOY = date(2026, 8, 10)


def _saldo(db, cliente_id):
    cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente_id).first()
    return Decimal(str(cc.saldo)) if cc else Decimal("0")


class TestElReembolso:
    def test_mueve_la_caja_y_el_libro_en_un_solo_acto(self, db, cliente, usuario):
        """
        Hacer sólo la mitad de caja deja el saldo del cliente a favor por plata
        que ya se le devolvió. Hacer sólo la del libro le inventa una deuda.
        """
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", naturaleza="anticipo",
            concepto="Seña", monto=Decimal("100000"), fecha=HOY, creado_por=usuario.id,
        )
        db.flush()
        assert _saldo(db, cliente.id) == Decimal("-100000")

        mov_caja, mov_cc = CajaService(db).reembolsar(
            cliente_id=cliente.id, monto=Decimal("100000"), medio="transferencia",
            motivo="no pudimos entregar el auto", fecha=HOY, creado_por=usuario.id,
        )
        db.flush()

        assert _saldo(db, cliente.id) == Decimal("0")
        assert mov_cc.naturaleza == "reembolso"
        assert mov_cc.tipo == "debito"
        assert mov_caja.tipo == "reembolso"
        assert mov_caja.medio == "transferencia"
        # El movimiento de caja apunta a su asiento: desde uno se llega al otro.
        assert mov_caja.movimiento_cc_id == mov_cc.id

    def test_un_reembolso_por_transferencia_no_toca_el_efectivo_del_cajon(
        self, db, cliente, usuario, hacer_pago
    ):
        hacer_pago(cliente_id=cliente.id, monto="100000", medio_pago="efectivo", fecha=HOY)
        db.flush()
        svc = CajaService(db)
        assert svc.efectivo_acumulado() == Decimal("100000")

        svc.reembolsar(
            cliente_id=cliente.id, monto=Decimal("50000"), medio="transferencia",
            motivo="reintegro", fecha=HOY, creado_por=usuario.id,
        )
        db.flush()

        assert svc.efectivo_acumulado() == Decimal("100000"), (
            "salió del banco, no del cajón"
        )

    def test_un_reembolso_en_efectivo_si_lo_baja(self, db, cliente, usuario, hacer_pago):
        hacer_pago(cliente_id=cliente.id, monto="100000", medio_pago="efectivo", fecha=HOY)
        db.flush()
        svc = CajaService(db)

        svc.reembolsar(
            cliente_id=cliente.id, monto=Decimal("50000"), medio="efectivo",
            motivo="reintegro", fecha=HOY, creado_por=usuario.id,
        )
        db.flush()

        assert svc.efectivo_acumulado() == Decimal("50000")

    def test_sin_motivo_no_se_puede(self, db, cliente, usuario):
        with pytest.raises(ValueError):
            CajaService(db).reembolsar(
                cliente_id=cliente.id, monto=Decimal("1000"), medio="efectivo",
                motivo="  ", fecha=HOY, creado_por=usuario.id,
            )


class TestCancelaUbicar:
    """D-11: la única excepción a "la seña no se devuelve"."""

    def test_la_sena_se_reintegra_entera(self, db, cliente, usuario, hacer_reserva):
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "transferencia", usuario.id, fecha=HOY,
        )
        db.flush()
        assert _saldo(db, cliente.id) == Decimal("-100000")

        ReservaService(db).cancelar(
            reserva.id, usuario.id,
            "el auto se rompió y no tenemos otro de la categoría",
            responsable="ubicar", reembolso_medio="transferencia",
        )
        db.flush()

        assert _saldo(db, cliente.id) == Decimal("0")
        # No hay seña retenida: hay un reembolso.
        naturalezas = {m.naturaleza for m in db.query(MovimientoCuentaCorriente).all()}
        assert "reembolso" in naturalezas
        assert "sena_retenida" not in naturalezas
        # Y la plata salió de la caja.
        assert db.query(MovimientoCaja).filter_by(tipo="reembolso").count() == 1

    def test_la_ficha_no_queda_diciendo_que_le_debemos_un_auto(
        self, db, cliente, usuario, hacer_reserva
    ):
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "transferencia", usuario.id, fecha=HOY,
        )
        ReservaService(db).cancelar(
            reserva.id, usuario.id, "no pudimos cumplir",
            responsable="ubicar", reembolso_medio="transferencia",
        )
        db.flush()

        d = CuentaCorrienteService(db).desglose(cliente.id)
        assert d["anticipos"] == Decimal("0"), "el anticipo se consumió: se lo devolvimos"
        assert d["deuda"] == Decimal("0")

    def test_cancelar_por_el_cliente_sigue_reteniendo(
        self, db, cliente, usuario, hacer_reserva
    ):
        """La contracara: el default no cambió."""
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        ReservaService(db).registrar_cobro(
            reserva.id, Decimal("100000"), "efectivo", usuario.id, fecha=HOY,
        )
        ReservaService(db).cancelar(reserva.id, usuario.id, "se arrepintió")
        db.flush()

        assert _saldo(db, cliente.id) == Decimal("0")
        naturalezas = {m.naturaleza for m in db.query(MovimientoCuentaCorriente).all()}
        assert "sena_retenida" in naturalezas
        assert "reembolso" not in naturalezas
        assert db.query(MovimientoCaja).count() == 0

    def test_un_responsable_inventado_no_pasa(self, db, cliente, usuario, hacer_reserva):
        from app.core.exceptions import BusinessRuleError

        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        with pytest.raises(BusinessRuleError):
            ReservaService(db).cancelar(
                reserva.id, usuario.id, "algo", responsable="el clima",
            )


class TestBonificarNoEsAnular:
    def test_bonificar_una_multa_deja_naturaleza_bonificacion(
        self, db, cliente, usuario, vehiculo
    ):
        m = Multa(
            patente=vehiculo.patente, vehiculo_id=vehiculo.id, cliente_id=cliente.id,
            fecha_infraccion=date(2026, 8, 5), monto=Decimal("75000"), estado="pendiente",
        )
        db.add(m)
        db.flush()
        MultaService(db).actualizar(m.id, MultaUpdate(estado="imputada"), usuario.id)
        db.flush()

        MultaService(db).resolver(m.id, "bonificada", "cliente frecuente", usuario.id)
        db.flush()

        contra = db.query(MovimientoCuentaCorriente).filter_by(tipo="credito").one()
        assert contra.naturaleza == "bonificacion", (
            "regalar plata y corregir un error no son lo mismo aunque muevan igual el saldo"
        )
        assert _saldo(db, cliente.id) == Decimal("0")

    def test_anular_un_movimiento_mal_cargado_sigue_siendo_anulacion(
        self, db, cliente, usuario
    ):
        mov = CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="debito", naturaleza="alquiler",
            concepto="Alquiler #1", monto=Decimal("400000"), fecha=HOY,
            creado_por=usuario.id,
        )
        db.flush()
        CuentaCorrienteService(db).anular_movimiento(
            mov.id, "se cargó al cliente equivocado", usuario.id
        )
        db.flush()

        contra = db.query(MovimientoCuentaCorriente).filter_by(tipo="credito").one()
        assert contra.naturaleza == "anulacion"
