"""
Un alquiler que sale y vuelve el mismo día se puede cargar.

**El caso, con las palabras del cliente:** *"quiero hacer una reserva para el
29/9, retira 7:30 y devuelve el mismo día 18:40 y no me deja cargarlo. Si lo
quiero poner como un late check-in me dice que la devolución tiene que ser
posterior al retiro."*

Eran tres cosas juntas: la pantalla comparaba sólo fechas, la hora de
devolución estaba bloqueada a la del retiro, y el precio se calculaba como
`fecha_fin - fecha_inicio`, que da 0 días y no tiene tarifa. Acá se fija lo del
backend: el mismo día es **un día**, y la devolución cargada es la devolución
esperada — no la hora del retiro.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.domain.tarifas import calcular_duracion_dias, duracion_facturable_dias
from app.services.alquiler_service import _devolucion_acordada
from app.services.reserva_service import ReservaService

DIA = date(2026, 9, 29)


class TestLaDuracionFacturable:
    def test_el_mismo_dia_es_un_dia(self):
        assert duracion_facturable_dias(DIA, DIA) == 1

    def test_el_resto_no_cambia(self):
        assert duracion_facturable_dias(DIA, date(2026, 10, 2)) == 3

    def test_la_duracion_a_secas_sigue_siendo_cero(self):
        """`calcular_duracion_dias` dice cuánto dura; el mínimo es sólo para cotizar."""
        assert calcular_duracion_dias(DIA, DIA) == 0


@pytest.fixture
def crear(db, cliente, usuario, vehiculo):
    def _hacer(**extra):
        kwargs = dict(
            cliente_id=cliente.id,
            vehiculo_id=vehiculo.id,
            fecha_inicio=DIA,
            hora_inicio=time(7, 30),
            fecha_fin=DIA,
            hora_fin=time(18, 40),
            lugar_entrega="Paraguay 241",
            lugar_devolucion="Paraguay 241",
            precio_total=Decimal("90000"),
            descuento_motivo="Precio pactado",
            usuario_id=usuario.id,
        )
        kwargs.update(extra)
        reserva, _ = ReservaService(db).create(**kwargs)
        db.flush()
        return reserva
    return _hacer


class TestReservaDelMismoDia:
    def test_se_puede_crear(self, crear):
        reserva = crear()
        assert reserva.fecha_inicio == reserva.fecha_fin == DIA
        assert reserva.hora_fin == time(18, 40)

    def test_la_devolucion_esperada_es_la_cargada_no_la_del_retiro(self, crear):
        """
        Si el default fuera la hora del retiro, la devolución acordada quedaría
        a las 07:30 — **antes** de la entrega — y el control de excedente
        cobraría once horas que no existen.
        """
        reserva = crear()
        assert _devolucion_acordada(reserva).isoformat() == "2026-09-29T18:40:00"

    def test_la_hora_de_devolucion_tiene_que_ser_posterior(self, crear):
        with pytest.raises(BusinessRuleError):
            crear(hora_inicio=time(18, 40), hora_fin=time(7, 30))

    def test_la_misma_hora_no_es_un_alquiler(self, crear):
        with pytest.raises(BusinessRuleError):
            crear(hora_inicio=time(10, 0), hora_fin=time(10, 0))

    def test_editar_la_hora_de_devolucion_mueve_la_esperada(self, db, crear, usuario):
        reserva = crear()
        ReservaService(db).update(reserva.id, hora_fin=time(20, 0), usuario_id=usuario.id)
        db.refresh(reserva)
        assert _devolucion_acordada(reserva).isoformat() == "2026-09-29T20:00:00"
