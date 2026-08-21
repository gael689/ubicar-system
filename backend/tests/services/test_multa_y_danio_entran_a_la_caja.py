"""
Cobrar una multa o un daño entra a la caja del día, y no se puede cobrar dos veces.

`PLAN_DINERO.md` §1.4: ni `multa_service` ni `danio_service` creaban un `Pago`.
Sólo asentaban el crédito, así que la deuda del cliente bajaba pero **esa plata
no aparecía en la caja de ningún día** — el arqueo del mostrador no cerraba y
nadie sabía por qué.

Y el reverso: si alguien cobraba la multa con un cobro suelto desde Caja y
**además** la resolvía como cobrada, se generaban dos créditos por la misma
plata. Desde este commit serían además dos pagos en la caja, así que la guarda
va junto con el `Pago`, no después.

Decisión 1 del dueño (§10): **la multa se cobra desde el módulo de multas**. El
cobro suelto de Caja sigue existiendo para lo que no cuelga de nada.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.models.multa import Multa
from app.models.pago import Pago
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.danio_service import DanioService
from app.services.multa_service import MultaService
from app.schemas.multa import MultaUpdate

HOY = date(2026, 9, 10)


@pytest.fixture()
def multa_imputada(db, cliente, usuario, vehiculo):
    m = Multa(
        patente=vehiculo.patente,
        vehiculo_id=vehiculo.id,
        cliente_id=cliente.id,
        fecha_infraccion=date(2026, 8, 15),
        monto=Decimal("75000"),
        estado="pendiente",
    )
    db.add(m)
    db.flush()
    MultaService(db).actualizar(m.id, MultaUpdate(estado="imputada"), usuario.id)
    db.flush()
    return m


def _saldo(db, cliente_id):
    cc = db.query(CuentaCorriente).filter_by(cliente_id=cliente_id).first()
    return Decimal(str(cc.saldo)) if cc else Decimal("0")


class TestMultaCobrada:
    def test_aparece_en_la_caja_del_dia_con_su_medio(
        self, db, cliente, usuario, multa_imputada
    ):
        assert _saldo(db, cliente.id) == Decimal("75000")
        assert db.query(Pago).count() == 0

        MultaService(db).resolver(
            multa_imputada.id, "cobrada", None, usuario.id,
            medio_pago="transferencia", fecha_cobro=HOY,
        )
        db.flush()

        pagos = db.query(Pago).all()
        assert len(pagos) == 1
        assert Decimal(str(pagos[0].monto)) == Decimal("75000")
        assert pagos[0].medio_pago == "transferencia"
        assert pagos[0].fecha == HOY
        assert pagos[0].cliente_id == cliente.id
        assert _saldo(db, cliente.id) == Decimal("0")

    def test_el_credito_queda_atado_al_pago_y_a_la_multa(
        self, db, cliente, usuario, multa_imputada
    ):
        MultaService(db).resolver(multa_imputada.id, "cobrada", None, usuario.id,
                                  fecha_cobro=HOY)
        db.flush()

        credito = (
            db.query(MovimientoCuentaCorriente)
            .filter_by(multa_id=multa_imputada.id, tipo="credito")
            .one()
        )
        assert credito.pago_id == db.query(Pago).one().id

    def test_cobrarla_dos_veces_no_duplica_ni_el_pago_ni_el_credito(
        self, db, cliente, usuario, multa_imputada
    ):
        svc = MultaService(db)
        svc.resolver(multa_imputada.id, "cobrada", None, usuario.id, fecha_cobro=HOY)
        db.flush()

        # Devolverla a "imputada" a mano y volver a cobrarla: la guarda mira el
        # crédito, no el estado, porque el crédito es el hecho económico.
        multa_imputada.estado = "imputada"
        db.flush()

        with pytest.raises(BusinessRuleError):
            svc.resolver(multa_imputada.id, "cobrada", None, usuario.id, fecha_cobro=HOY)

        assert db.query(Pago).count() == 1
        assert db.query(MovimientoCuentaCorriente).filter_by(
            multa_id=multa_imputada.id, tipo="credito"
        ).count() == 1

    def test_un_cobro_suelto_previo_bloquea_la_resolucion(
        self, db, cliente, usuario, multa_imputada, hacer_pago
    ):
        """
        El caso que describe §1.4: alguien la cobró desde Caja y después la
        resuelve acá. Antes se generaban dos créditos.
        """
        pago = hacer_pago(cliente_id=cliente.id, monto="75000", fecha=HOY)
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente.id, tipo="credito", concepto="Cobro a cuenta (efectivo)",
            monto=Decimal("75000"), fecha=HOY, creado_por=usuario.id,
            pago_id=pago.id, multa_id=multa_imputada.id,
        )
        db.flush()

        with pytest.raises(BusinessRuleError):
            MultaService(db).resolver(multa_imputada.id, "cobrada", None, usuario.id)

        assert _saldo(db, cliente.id) == Decimal("0")

    def test_bonificarla_sigue_anulando_el_debito(self, db, cliente, usuario, multa_imputada):
        MultaService(db).resolver(multa_imputada.id, "bonificada", "gesto comercial", usuario.id)
        db.flush()

        assert _saldo(db, cliente.id) == Decimal("0")
        assert db.query(Pago).count() == 0, "bonificar no es cobrar: no entra plata"


@pytest.fixture()
def danio_imputado(db, cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler):
    from app.models.danio import Danio

    reserva = hacer_reserva(precio_total="200000", estado="finalizada")
    alquiler = hacer_alquiler(reserva)
    d = Danio(
        vehiculo_id=vehiculo.id,
        alquiler_id=alquiler.id,
        cliente_id=cliente.id,
        momento="checkin",
        zona="paragolpes trasero",
        tipo="abolladura",
        severidad="moderado",
        fecha_deteccion=date(2026, 9, 5),
        costo_estimado=Decimal("120000"),
        estado="valorizado",
    )
    db.add(d)
    db.flush()
    DanioService(db).imputar(d.id, Decimal("90000"), usuario_id=usuario.id)
    db.flush()
    return d


class TestDanioCobrado:
    def test_aparece_en_la_caja_del_dia(self, db, cliente, usuario, danio_imputado):
        assert _saldo(db, cliente.id) == Decimal("90000")

        DanioService(db).cobrar(danio_imputado.id, usuario_id=usuario.id,
                                medio_pago="efectivo", fecha_cobro=HOY)
        db.flush()

        pago = db.query(Pago).one()
        assert Decimal(str(pago.monto)) == Decimal("90000")
        assert pago.fecha == HOY
        assert _saldo(db, cliente.id) == Decimal("0")

    def test_cobrarlo_dos_veces_no_duplica_nada(self, db, cliente, usuario, danio_imputado):
        svc = DanioService(db)
        svc.cobrar(danio_imputado.id, usuario_id=usuario.id, fecha_cobro=HOY)
        db.flush()

        with pytest.raises(BusinessRuleError):
            svc.cobrar(danio_imputado.id, usuario_id=usuario.id, fecha_cobro=HOY)

        assert db.query(Pago).count() == 1

    def test_cobrarlo_no_lo_repara(self, db, usuario, danio_imputado, vehiculo):
        """Sigue siendo un daño del auto: se precarga en el próximo check-out."""
        svc = DanioService(db)
        svc.cobrar(danio_imputado.id, usuario_id=usuario.id, fecha_cobro=HOY)
        db.flush()

        assert danio_imputado.estado == "imputado"
        assert danio_imputado.id in {d.id for d in svc.preexistentes_de(vehiculo.id)}

    def test_no_se_puede_cobrar_uno_que_no_esta_imputado(self, db, usuario, danio_imputado):
        DanioService(db).bonificar(danio_imputado.id, "gesto comercial", usuario.id)
        db.flush()

        with pytest.raises(BusinessRuleError):
            DanioService(db).cobrar(danio_imputado.id, usuario_id=usuario.id)
