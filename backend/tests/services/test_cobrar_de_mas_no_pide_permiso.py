"""
Cobrar por debajo del precio de lista pide motivo; cobrar por encima, no.

**El reporte**, del mostrador: *"el cartel no me deja continuar si no le aclaro
por la diferencia del precio sugerido. Está bueno cuando es un monto menor, pero
en casos como estos que Martín le cobró más para hacer unos pesos no debería
preguntar demasiado, jajaja, más plata mejor."*

Y es razonable. `precio_lista` existe para **auditar el descuento** (ítem 22):
plata que sale de la empresa y que alguien tiene que poder explicar. Un recargo
no es eso. Frenar la carga de una reserva para que escriban "le cobré más" es
poner una puerta donde no hay riesgo, con el cliente esperando enfrente.

Lo que **no** se afloja es el registro: `precio_lista` sigue guardando el precio
que salió del motor, y `descuento_autorizado_por` sigue diciendo quién decidió
la diferencia. Se saca la puerta, no la constancia.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.tarifa import Tarifa
from app.services.reserva_service import ReservaService


@pytest.fixture
def con_tarifa(db, vehiculo):
    """
    Una tarifa diaria para que exista un precio de lista contra el cual
    comparar. Sin tarifa, `precio_lista` queda en `None` y la regla no aplica.
    """
    db.add(Tarifa(
        vehiculo_id=vehiculo.id,
        tipo="diaria",
        monto=Decimal("50000"),
        activo=True,
    ))
    db.flush()
    return vehiculo


def _crear(db, cliente, usuario, vehiculo, precio, motivo=None):
    reserva, _ = ReservaService(db).create(
        cliente_id=cliente.id,
        vehiculo_id=vehiculo.id,
        fecha_inicio=date(2026, 9, 1),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 9, 2),
        hora_fin=time(10, 0),
        lugar_entrega="Paraguay 241",
        lugar_devolucion="Paraguay 241",
        precio_total=Decimal(str(precio)),
        descuento_motivo=motivo,
        usuario_id=usuario.id,
    )
    db.flush()
    return reserva


class TestElRecargo:
    def test_se_guarda_sin_que_nadie_escriba_un_motivo(
        self, db, cliente, usuario, con_tarifa
    ):
        """Lista $50.000, se cobran $70.000. No pregunta."""
        reserva = _crear(db, cliente, usuario, con_tarifa, 70000)
        assert Decimal(str(reserva.precio_total)) == Decimal("70000")

    def test_pero_queda_registrado_quien_lo_decidio(
        self, db, cliente, usuario, con_tarifa
    ):
        """
        La auditoría no se pierde: sin motivo escrito, el sistema pone uno que
        dice lo que pasó, y `descuento_autorizado_por` guarda a quién.
        """
        reserva = _crear(db, cliente, usuario, con_tarifa, 70000)
        assert reserva.descuento_autorizado_por == usuario.id
        assert reserva.descuento_motivo == "Precio acordado por encima del de lista"
        assert reserva.precio_lista is not None
        assert Decimal(str(reserva.precio_lista)) < Decimal("70000")

    def test_un_motivo_escrito_a_mano_no_se_pisa(self, db, cliente, usuario, con_tarifa):
        reserva = _crear(db, cliente, usuario, con_tarifa, 70000, motivo="Temporada alta")
        assert reserva.descuento_motivo == "Temporada alta"


class TestElDescuento:
    def test_sin_motivo_se_rechaza(self, db, cliente, usuario, con_tarifa):
        """Esto sí es plata que sale, y sigue exigiendo explicación."""
        with pytest.raises(BusinessRuleError) as e:
            _crear(db, cliente, usuario, con_tarifa, 30000)
        assert "descuento_sin_motivo" in str(e.value)

    def test_con_motivo_se_guarda(self, db, cliente, usuario, con_tarifa):
        reserva = _crear(db, cliente, usuario, con_tarifa, 30000, motivo="Cliente frecuente")
        assert Decimal(str(reserva.precio_total)) == Decimal("30000")
        assert reserva.descuento_motivo == "Cliente frecuente"
        assert reserva.descuento_autorizado_por == usuario.id
