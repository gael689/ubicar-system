"""
La seña que se declara al armar la reserva también entra a la caja.

**El reporte que lo destapó**, del mostrador: *"ahí ya había registrado el pago
y sale como pendiente 160 mil de vuelta"*. Reserva de $160.000 marcada como
abonada al retirar el auto, y al registrar la devolución la pantalla vuelve a
pedir los $160.000.

`ReservaService.create()` escribía `Reserva.anticipo_monto` y nada más. Todo lo
que contesta *"¿cuánto falta cobrar?"* mira los `Pago`
(`cobranza_service.monto_cobrado`), no ese campo: con cero pagos, el saldo era
el total.

`tests/services/test_la_sena_tiene_un_solo_camino.py` ya fija la misma regla
para `registrar_cobro()`. Este archivo la fija para el alta, que era la única
puerta que quedaba afuera de la tabla del `PLAN_DINERO.md` §2.6.
"""
from datetime import date, time
from decimal import Decimal

from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.pago import Pago
from app.services import cobranza_service
from app.services.alquiler_service import AlquilerService
from app.services.reserva_service import ReservaService

COBRO = date(2026, 8, 20)


def _crear(db, cliente, usuario, vehiculo, **extra):
    """Una reserva por el camino real: `ReservaService.create`, no el modelo."""
    kwargs = dict(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 9, 1),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 9, 5),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal("160000"),
        descuento_motivo="Precio pactado",
        usuario_id=usuario.id,
    )
    kwargs.update(extra)
    reserva, _ = ReservaService(db).create(**kwargs)
    db.flush()
    return reserva


class TestLaSenaDeclaradaAlCrear:
    def test_deja_un_pago_con_la_fecha_en_que_entro(self, db, cliente, usuario, vehiculo):
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="pagado",
            anticipo_monto=Decimal("160000"),
            anticipo_fecha=COBRO,
            anticipo_medio_pago="efectivo",
        )

        pago = db.query(Pago).filter_by(reserva_id=reserva.id).one()
        assert Decimal(str(pago.monto)) == Decimal("160000")
        assert pago.medio_pago == "efectivo"
        assert pago.fecha == COBRO
        assert pago.alquiler_id is None, "todavía no hay alquiler: es la seña"

    def test_deja_el_credito_como_anticipo_y_no_como_saldo_a_favor(
        self, db, cliente, usuario, vehiculo
    ):
        """
        Le debemos un auto, no plata. Por eso el crédito nace con naturaleza
        `anticipo` y no como un pago suelto — es lo que permite que la ficha
        del cliente no diga "tiene saldo a favor" antes de entregar.
        """
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="pagado",
            anticipo_monto=Decimal("160000"),
            anticipo_fecha=COBRO,
            anticipo_medio_pago="transferencia",
        )

        mov = (
            db.query(MovimientoCuentaCorriente)
            .filter_by(reserva_id=reserva.id, tipo="credito")
            .one()
        )
        assert mov.naturaleza == "anticipo"
        assert mov.aplicado_en is None, "todavía no se consumió: el auto no salió"

        cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente.id).one()
        assert Decimal(str(cc.saldo)) == Decimal("-160000")

    def test_sin_anticipo_no_asienta_nada(self, db, cliente, usuario, vehiculo):
        """La reserva impaga tiene que seguir sin mover un peso."""
        reserva = _crear(db, cliente, usuario, vehiculo, estado_pago="pendiente")

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 0
        assert db.query(MovimientoCuentaCorriente).filter_by(reserva_id=reserva.id).count() == 0

    def test_el_echeq_no_duplica_el_credito(self, db, cliente, usuario, vehiculo):
        """
        Un echeq recibido ya asienta su crédito con naturaleza
        `echeq_en_cartera`. El `Pago` se crea igual —la caja lo necesita— pero
        un segundo crédito `anticipo` haría que el check-out lo marcara aplicado
        como si fuera plata cobrada. Un cheque es un papel que puede rebotar.
        """
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="pagado",
            anticipo_monto=Decimal("160000"),
            anticipo_fecha=COBRO,
            anticipo_medio_pago="echeq",
        )

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 1

        naturalezas = [
            m.naturaleza
            for m in db.query(MovimientoCuentaCorriente).filter_by(reserva_id=reserva.id)
        ]
        assert naturalezas == ["echeq_en_cartera"]


class TestDespuesDeEntregarElAuto:
    def test_no_queda_saldo_pendiente(self, db, cliente, usuario, vehiculo):
        """
        **El caso reportado, de punta a punta.** Es lo que la pantalla de
        devolución lee para decir "Saldo base pendiente".
        """
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="pagado",
            anticipo_monto=Decimal("160000"),
            anticipo_fecha=COBRO,
            anticipo_medio_pago="efectivo",
        )

        alquiler, _ = AlquilerService(db).checkout(
            reserva_id=reserva.id,
            checkout_fecha=date(2026, 9, 1),
            checkout_hora=time(10, 0),
            checkout_km=vehiculo.km_actual,
            checkout_combustible=100,
            checkout_descripcion=None,
            usuario_id=usuario.id,
            motivo_sin_contrato="Se firma en el mostrador",
        )
        db.flush()

        assert cobranza_service.monto_facturado(alquiler) == Decimal("160000")
        assert cobranza_service.monto_cobrado(db, alquiler) == Decimal("160000")
        assert cobranza_service.saldo_pendiente(db, alquiler) == Decimal("0")
        assert alquiler.id not in cobranza_service.alquileres_con_saldo_pendiente(db)

    def test_el_anticipo_queda_marcado_como_aplicado(self, db, cliente, usuario, vehiculo):
        """
        Si el anticipo quedara "por aplicar", `deuda = saldo + anticipos`
        sobreestimaría la deuda por el importe entero de la seña, para siempre
        (`PLAN_DINERO.md` §4.2).
        """
        reserva = _crear(
            db, cliente, usuario, vehiculo,
            estado_pago="pagado",
            anticipo_monto=Decimal("160000"),
            anticipo_fecha=COBRO,
            anticipo_medio_pago="efectivo",
        )
        AlquilerService(db).checkout(
            reserva_id=reserva.id,
            checkout_fecha=date(2026, 9, 1),
            checkout_hora=time(10, 0),
            checkout_km=vehiculo.km_actual,
            checkout_combustible=100,
            checkout_descripcion=None,
            usuario_id=usuario.id,
            motivo_sin_contrato="Se firma en el mostrador",
        )
        db.flush()

        anticipo = (
            db.query(MovimientoCuentaCorriente)
            .filter_by(reserva_id=reserva.id, naturaleza="anticipo")
            .one()
        )
        assert anticipo.aplicado_en is not None

        cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente.id).one()
        assert Decimal(str(cc.saldo)) == Decimal("0"), "facturado y cobrado se cancelan"
