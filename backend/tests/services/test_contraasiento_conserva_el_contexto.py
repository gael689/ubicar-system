"""
El contra-asiento se queda en el historial de la entidad que lo originó.

`PLAN_DINERO.md` §1.5.b: `anular_movimiento` propagaba `alquiler_id`,
`reserva_id`, `echeq_id`, `multa_id`, `recibo_id` y `comprobante_id` — y
**omitía `danio_id`**, aunque su propio comentario afirmaba que se propagaban
todas salvo `pago_id`. Al bonificar un daño, la reversión desaparecía del
historial de ese daño: quedaba el débito marcado anulado y ningún rastro de por
qué, mirado desde el daño.
"""
from datetime import date
from decimal import Decimal

from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.danio import Danio
from app.services.danio_service import DanioService


def _danio_imputado(db, cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler):
    reserva = hacer_reserva(precio_total="200000", estado="finalizada")
    alquiler = hacer_alquiler(reserva)
    d = Danio(
        vehiculo_id=vehiculo.id, alquiler_id=alquiler.id, cliente_id=cliente.id,
        momento="checkin", zona="puerta trasera izq.", tipo="rayon",
        severidad="leve", fecha_deteccion=date(2026, 9, 5),
        costo_estimado=Decimal("60000"), estado="valorizado",
    )
    db.add(d)
    db.flush()
    DanioService(db).imputar(d.id, Decimal("60000"), usuario_id=usuario.id)
    db.flush()
    return d


class TestBonificarUnDanio:
    def test_la_reversion_queda_en_el_historial_del_danio(
        self, db, cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler
    ):
        danio = _danio_imputado(db, cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler)

        DanioService(db).bonificar(danio.id, "el rayón ya estaba", usuario.id)
        db.flush()

        movs = (
            db.query(MovimientoCuentaCorriente)
            .filter_by(danio_id=danio.id)
            .order_by(MovimientoCuentaCorriente.id)
            .all()
        )
        assert len(movs) == 2, "el débito y su contra-asiento, los dos con danio_id"
        debito, contra = movs
        assert debito.tipo == "debito" and debito.anulado is True
        assert contra.tipo == "credito"
        assert contra.id == debito.anulado_por_movimiento_id
        assert "el rayón ya estaba" in contra.concepto

    def test_el_resto_del_contexto_se_sigue_propagando(
        self, db, cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler
    ):
        danio = _danio_imputado(db, cliente, usuario, vehiculo, hacer_reserva, hacer_alquiler)
        alquiler_id = danio.alquiler_id

        DanioService(db).bonificar(danio.id, "gesto comercial", usuario.id)
        db.flush()

        contra = (
            db.query(MovimientoCuentaCorriente)
            .filter_by(danio_id=danio.id, tipo="credito")
            .one()
        )
        assert contra.alquiler_id == alquiler_id
