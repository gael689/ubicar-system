"""
Una reserva de la web no se duplica, y se puede cancelar.

**El bug.** El dueño hizo una reserva por transferencia, volvió atrás en el
navegador —los datos quedaron precargados y el contador seguía corriendo—,
apretó continuar y **se creó una segunda reserva idéntica**. Después probó con
Mercado Pago sobre lo mismo, no pagó, y apareció una tercera.

**La causa.** La llave de idempotencia era `PagoWeb`, y el camino de
transferencia **no crea ninguno** (no hay pasarela). Así que:

- transferencia → transferencia: nada lo frenaba.
- transferencia → Mercado Pago: el camino de MP buscaba un `PagoWeb` previo, no
  encontraba ninguno, y creaba otra reserva.

**El arreglo.** La llave pasa a ser el **hold**, que es lo único común a los dos
caminos. `Hold.reserva_id` ya existía en el modelo y sólo se escribía al
consumirlo (o sea después de que entrara la plata); ahora se escribe al crear la
reserva, dejando el hold `vigente` para que el cupo se siga sosteniendo igual.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest

from app.domain.enums import EstadoReserva
from app.models.hold import Hold
from app.models.reserva import Reserva
from app.services.pago_web_service import PagoWebService
from app.services.reserva_service import ReservaService


@pytest.fixture()
def hold(db, vehiculo):
    """Un hold vigente sobre una categoría con flota."""
    from app.models.categoria import Categoria

    cat = Categoria(codigo="COMP", nombre="Compacto", franquicia_base=Decimal("1500000"))
    db.add(cat)
    db.flush()
    vehiculo.categoria_id = cat.id

    h = Hold(
        token="tok-de-prueba-123",
        categoria_id=cat.id,
        fecha_inicio=date(2026, 9, 10),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 9, 14),
        hora_fin=time(10, 0),
        expira_en=datetime.utcnow() + timedelta(minutes=20),
        estado="vigente",
    )
    db.add(h)
    db.flush()
    return h


class TestElHoldEsLaLlave:
    def test_sin_reserva_todavia_no_devuelve_nada(self, db, hold):
        assert PagoWebService(db)._reserva_pendiente_del_hold(hold) is None

    def test_encuentra_la_reserva_que_ese_hold_genero(
        self, db, hold, cliente, usuario, hacer_reserva
    ):
        reserva = hacer_reserva(precio_total="400000", estado="pendiente_pago")
        hold.reserva_id = reserva.id
        db.flush()

        encontrada = PagoWebService(db)._reserva_pendiente_del_hold(hold)
        assert encontrada is not None
        assert encontrada.id == reserva.id

    def test_una_reserva_ya_confirmada_no_se_reusa(
        self, db, hold, cliente, usuario, hacer_reserva
    ):
        """
        Si el cliente ya pagó y la reserva se confirmó, un POST repetido no
        puede engancharse a ella: eso sería reabrir una venta cerrada.
        """
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        hold.reserva_id = reserva.id
        db.flush()

        assert PagoWebService(db)._reserva_pendiente_del_hold(hold) is None

    def test_una_reserva_cancelada_tampoco(self, db, hold, cliente, usuario, hacer_reserva):
        reserva = hacer_reserva(precio_total="400000", estado="cancelada")
        hold.reserva_id = reserva.id
        db.flush()

        assert PagoWebService(db)._reserva_pendiente_del_hold(hold) is None


class TestCancelarUnaReservaDeLaWeb:
    """
    `cancelar()` sólo aceptaba `pendiente` y `confirmada`. Una reserva de la web
    esperando pago no se podía sacar del listado ni aunque el cliente avisara
    que no iba a pagar: quedaba ahí para siempre, mezclada con las que sí.
    """

    @pytest.mark.parametrize(
        "estado",
        ["pendiente_pago", "sin_disponibilidad", "revision_sin_cupo"],
    )
    def test_los_estados_de_la_web_ahora_se_pueden_cancelar(
        self, db, cliente, usuario, hacer_reserva, estado
    ):
        reserva = hacer_reserva(precio_total="400000", estado=estado)

        ReservaService(db).cancelar(reserva.id, usuario.id, "el cliente no va a pagar")
        db.flush()

        assert reserva.estado == EstadoReserva.CANCELADA.value
        assert reserva.motivo_cancelacion == "el cliente no va a pagar"

    def test_queda_en_el_historial_con_quien_y_por_que(
        self, db, cliente, usuario, hacer_reserva
    ):
        from app.models.auditoria import Auditoria

        reserva = hacer_reserva(precio_total="400000", estado="pendiente_pago")
        ReservaService(db).cancelar(reserva.id, usuario.id, "nunca transfirió")
        db.flush()

        auditorias = (
            db.query(Auditoria)
            .filter_by(entidad_tipo="reserva", entidad_id=reserva.id, accion="cancelar")
            .all()
        )
        assert len(auditorias) == 1
        assert "nunca transfirió" in auditorias[0].descripcion
        assert auditorias[0].usuario_id == usuario.id

    def test_sin_motivo_no_se_cancela(self, db, cliente, usuario, hacer_reserva):
        from app.core.exceptions import BusinessRuleError

        reserva = hacer_reserva(precio_total="400000", estado="pendiente_pago")
        with pytest.raises(BusinessRuleError):
            ReservaService(db).cancelar(reserva.id, usuario.id, "   ")

    def test_una_finalizada_sigue_sin_poder_cancelarse(
        self, db, cliente, usuario, hacer_reserva
    ):
        from app.core.exceptions import ConflictError

        reserva = hacer_reserva(precio_total="400000", estado="finalizada")
        with pytest.raises(ConflictError):
            ReservaService(db).cancelar(reserva.id, usuario.id, "me equivoqué")
