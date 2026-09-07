"""
La migración 093 repara las señas que quedaron sin asentar, y sólo esas.

**Por qué esta migración tiene tests y las otras no.** Las demás agregan una
columna: si fallan, el deploy no sale y se ve. Ésta **escribe plata** sobre
datos que ya existen — crea `Pago` y asientos en la cuenta corriente de clientes
reales. Un error acá no se ve: se ve seis meses después, cuando un saldo no
cierra y nadie sabe de dónde salió.

Lo que hay que poder afirmar es exactamente esto: repara lo roto, no toca lo
sano, y correrla dos veces no duplica nada.

Se ejecuta el `upgrade()` de verdad, contra la conexión de la base de prueba, en
vez de reimplementar su lógica en el test. Un test que copia el algoritmo que
prueba sólo demuestra que se sabe copiar.
"""
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
import importlib.util

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.pago import Pago
from app.models.reserva import Reserva
from app.services.cuenta_corriente_service import CuentaCorrienteService

_RUTA = (
    Path(__file__).resolve().parents[2]
    / "alembic" / "versions" / "093_la_sena_del_alta_es_un_cobro.py"
)


def _modulo_093():
    spec = importlib.util.spec_from_file_location("migracion_093", _RUTA)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def correr_093(db) -> None:
    """Ejecuta el `upgrade()` real sobre la conexión de la base de prueba."""
    modulo = _modulo_093()
    conexion = db.connection()
    ctx = MigrationContext.configure(conexion)
    with Operations.context(ctx):
        modulo.upgrade()
    db.expire_all()


@pytest.fixture
def reserva_rota(db, cliente, usuario, vehiculo):
    """
    Una reserva como las que dejó el bug: `anticipo_monto` cargado y ni `Pago`
    ni asiento detrás. Se construye con el modelo a propósito — `create()` ya
    está arreglado y no puede producirla.
    """
    def _hacer(**extra):
        campos = dict(
            vehiculo_id=vehiculo.id,
            cliente_id=cliente.id,
            fecha_inicio=date(2026, 9, 1),
            hora_inicio=time(10, 0),
            fecha_fin=date(2026, 9, 5),
            hora_fin=time(10, 0),
            lugar_entrega="Paraguay 241",
            lugar_devolucion="Paraguay 241",
            estado="confirmada",
            usuario_id=usuario.id,
            precio_total=Decimal("160000"),
            estado_pago="pagado",
            anticipo_monto=Decimal("160000"),
            anticipo_fecha=date(2026, 8, 20),
            anticipo_medio_pago="efectivo",
            created_at=datetime(2026, 8, 20, 15, 0),
        )
        campos.update(extra)
        r = Reserva(**campos)
        db.add(r)
        db.flush()
        return r
    return _hacer


class TestReparaLoRoto:
    def test_crea_el_pago_que_faltaba(self, db, reserva_rota):
        reserva = reserva_rota()
        correr_093(db)

        pago = db.query(Pago).filter_by(reserva_id=reserva.id).one()
        assert Decimal(str(pago.monto)) == Decimal("160000")
        assert pago.medio_pago == "efectivo"
        assert pago.fecha == date(2026, 8, 20), "la plata entró ese día, no hoy"
        assert pago.alquiler_id is None

    def test_crea_el_credito_como_anticipo(self, db, cliente, reserva_rota):
        reserva = reserva_rota()
        correr_093(db)

        mov = (
            db.query(MovimientoCuentaCorriente)
            .filter_by(reserva_id=reserva.id, tipo="credito")
            .one()
        )
        assert mov.naturaleza == "anticipo"
        assert Decimal(str(mov.saldo_posterior)) == Decimal("-160000")

        cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente.id).one()
        assert Decimal(str(cc.saldo)) == Decimal("-160000")

    def test_sin_medio_declarado_asume_efectivo(self, db, reserva_rota):
        """
        `anticipo_medio_pago` es texto libre y puede venir vacío o con algo que
        el enum de `pagos` no acepta. Un INSERT inválido voltearía la migración
        entera, y con ella el deploy.
        """
        reserva = reserva_rota(anticipo_medio_pago=None)
        correr_093(db)

        pago = db.query(Pago).filter_by(reserva_id=reserva.id).one()
        assert pago.medio_pago == "efectivo"

    def test_un_medio_que_no_existe_tampoco_la_voltea(self, db, reserva_rota):
        reserva = reserva_rota(anticipo_medio_pago="mercadolibre")
        correr_093(db)

        pago = db.query(Pago).filter_by(reserva_id=reserva.id).one()
        assert pago.medio_pago == "efectivo"


class TestNoTocaLoSano:
    def test_una_reserva_que_ya_tiene_su_pago_queda_igual(
        self, db, cliente, usuario, reserva_rota
    ):
        reserva = reserva_rota()
        db.add(Pago(
            cliente_id=cliente.id, reserva_id=reserva.id, monto=Decimal("160000"),
            medio_pago="transferencia", con_factura=False, cobrado_por=usuario.id,
            fecha=date(2026, 8, 20), anulado=False,
        ))
        db.flush()

        correr_093(db)

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 1

    def test_una_reserva_con_credito_pero_sin_pago_tampoco_se_toca(
        self, db, cliente, usuario, reserva_rota
    ):
        """
        El caso del echeq: `crear_recibido` asienta el crédito
        `echeq_en_cartera` y no hay `Pago`. Meterle uno ahora contaría dos veces
        el mismo cheque.
        """
        reserva = reserva_rota(anticipo_medio_pago="echeq")
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", naturaleza="echeq_en_cartera",
            concepto="Echeq recibido", monto=Decimal("160000"),
            fecha=date(2026, 8, 20), creado_por=usuario.id, reserva_id=reserva.id,
        )
        db.flush()

        correr_093(db)

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 0

    def test_una_reserva_cancelada_no_se_repara(self, db, reserva_rota):
        """
        `cancelar()` ya resolvió su seña por el camino de D-11. Meterle un
        `Pago` ahora movería la caja de un día que ya está cerrado.
        """
        reserva = reserva_rota(estado="cancelada")
        correr_093(db)

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 0

    def test_una_reserva_sin_anticipo_no_genera_nada(self, db, reserva_rota):
        reserva = reserva_rota(anticipo_monto=None, estado_pago="pendiente")
        correr_093(db)

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 0


class TestSePuedeCorrerDosVeces:
    def test_no_duplica_nada(self, db, cliente, reserva_rota):
        """
        Un deploy que se reintenta, un rollback y vuelta a subir: la migración
        tiene que poder correr de nuevo sin duplicar plata. Es idempotente por
        construcción —su condición de entrada es "no tiene nada"— y esto lo fija.
        """
        reserva = reserva_rota()
        correr_093(db)
        correr_093(db)

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 1
        assert db.query(MovimientoCuentaCorriente).filter_by(reserva_id=reserva.id).count() == 1

        cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente.id).one()
        assert Decimal(str(cc.saldo)) == Decimal("-160000"), "no se acreditó dos veces"


class TestElDowngradeDejaTodoComoEstaba:
    def test_saca_lo_que_puso_y_devuelve_el_saldo(self, db, cliente, reserva_rota):
        reserva = reserva_rota()
        correr_093(db)

        modulo = _modulo_093()
        ctx = MigrationContext.configure(db.connection())
        with Operations.context(ctx):
            modulo.downgrade()
        db.expire_all()

        assert db.query(Pago).filter_by(reserva_id=reserva.id).count() == 0
        assert db.query(MovimientoCuentaCorriente).filter_by(reserva_id=reserva.id).count() == 0

        cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente.id).one()
        assert Decimal(str(cc.saldo)) == Decimal("0")
