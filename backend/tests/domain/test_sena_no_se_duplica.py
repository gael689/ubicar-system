"""
La seña no se cuenta dos veces.

El cobro online asienta el crédito en el momento en que Mercado Pago acredita
(`PagoWebService._acreditar`: crea el `Pago` y su movimiento) y **además** deja
`anticipo_monto` en la reserva, para que el mostrador vea cuánto adelantó el
cliente.

El check-out miraba ese `anticipo_monto` y creaba un segundo pago con su
segundo crédito. Resultado: dos pagos en la caja y **el cliente con un saldo a
favor que nadie le debía**.

`tiene_credito_de_reserva` es la pregunta que corta eso. Se mira el movimiento
de cuenta corriente y no el pago ni el medio: el asiento es el hecho económico
y es lo único que no puede duplicarse.
"""
from sqlalchemy import Boolean, Column, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.services.cuenta_corriente_service import CuentaCorrienteService

Base = declarative_base()


class MovFalso(Base):
    """Copia mínima de la tabla, con las tres columnas que la consulta mira."""
    __tablename__ = "movimientos_cuenta_corriente"
    id = Column(Integer, primary_key=True)
    reserva_id = Column(Integer, nullable=True)
    tipo = Column(String, nullable=False)
    anulado = Column(Boolean, default=False, nullable=False)


def _sesion():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)()


def _servicio(db):
    svc = CuentaCorrienteService(db)
    # El service consulta el modelo real; acá se apunta al doble para poder
    # ejercitar la regla sin levantar el esquema entero.
    import app.services.cuenta_corriente_service as mod
    mod.MovimientoCuentaCorriente = MovFalso
    return svc


class TestSenaNoSeDuplica:
    def test_sin_movimientos_el_checkout_tiene_que_crear_el_anticipo(self):
        db = _sesion()
        assert _servicio(db).tiene_credito_de_reserva(1) is False

    def test_con_el_credito_del_cobro_online_el_checkout_no_lo_repite(self):
        db = _sesion()
        db.add(MovFalso(reserva_id=1, tipo="credito", anulado=False))
        db.commit()
        assert _servicio(db).tiene_credito_de_reserva(1) is True

    def test_un_debito_no_cuenta(self):
        """El débito del alquiler no es plata que entró: si lo contara, el
        anticipo nunca se registraría."""
        db = _sesion()
        db.add(MovFalso(reserva_id=1, tipo="debito", anulado=False))
        db.commit()
        assert _servicio(db).tiene_credito_de_reserva(1) is False

    def test_un_credito_anulado_no_cuenta(self):
        """Si alguien anuló el crédito del cobro online, el anticipo vuelve a
        hacer falta: si no, la plata desaparecería del libro."""
        db = _sesion()
        db.add(MovFalso(reserva_id=1, tipo="credito", anulado=True))
        db.commit()
        assert _servicio(db).tiene_credito_de_reserva(1) is False

    def test_el_credito_de_otra_reserva_no_cuenta(self):
        db = _sesion()
        db.add(MovFalso(reserva_id=99, tipo="credito", anulado=False))
        db.commit()
        assert _servicio(db).tiene_credito_de_reserva(1) is False
