"""
El check-in no puede fallar por la etiqueta del auto, y cuando algo falla de
verdad el mostrador tiene que leer un error, no un corte de conexión.

**El caso (15/10/2026, Ramiro):** *"hice como 6 autos y en 2 reservas
específicas me tira ese cartel. Me deja ingresar la data, pongo que se cobró,
fecha, todo, y al momento de registrar me tira esa"* — el cartel era "Se cortó
la conexión antes de la respuesta".

Eran dos cosas juntas:

1. `estado_tras_checkin` exigía que el auto figurara `alquilado` y tiraba
   `ValueError` si no. Desde el 06/10 el mostrador puede entregar un auto que
   en el sistema todavía figura afuera (avisa, no bloquea), así que un mismo
   auto puede tener dos alquileres abiertos: el primer check-in lo pasaba a
   `disponible` y el segundo explotaba. Siempre en las mismas reservas, nunca
   en las otras.
2. Esa excepción no la traducía nadie: el 500 lo armaba Starlette por fuera de
   CORS, sin `Access-Control-Allow-Origin`, y el navegador lo tiraba antes de
   que axios lo viera. Para la pantalla, la respuesta "nunca llegó".

El check-in fallaba **antes de escribir nada**, así que esos dos no quedaron
hechos a medias; reintentarlos daba el mismo error. Lo que sí se cuida acá es
que un reintento de un check-in que **sí** quedó hecho no cobre dos veces.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError, ConflictError
from app.domain.enums import DecisionExcedente
from app.models.pago import Pago
from app.schemas.alquiler import PagoInmediato
from app.services.alquiler_service import AlquilerService


@pytest.fixture
def dos_alquileres_abiertos(db, hacer_reserva, hacer_alquiler, vehiculo):
    """El mismo auto entregado dos veces sin que la primera se haya cerrado."""
    r1 = hacer_reserva(estado="vencida", fecha_inicio=date(2026, 10, 1), fecha_fin=date(2026, 10, 5))
    r2 = hacer_reserva(estado="activa", fecha_inicio=date(2026, 10, 6), fecha_fin=date(2026, 10, 10))
    a1 = hacer_alquiler(r1, checkout_fecha=date(2026, 10, 1))
    a2 = hacer_alquiler(r2, checkout_fecha=date(2026, 10, 6))
    vehiculo.estado = "alquilado"
    db.flush()
    return a1, a2


def _checkin(db, usuario, alquiler, *, fecha, km, pago=None):
    return AlquilerService(db).checkin(
        alquiler_id=alquiler.id,
        checkin_fecha=fecha,
        checkin_hora=time(9, 0),
        checkin_km=km,
        checkin_combustible=100,
        checkin_descripcion=None,
        decision_excedente=DecisionExcedente.COBRAR_COMPLETO,
        usuario_id=usuario.id,
        pago_inmediato=pago,
    )


class TestDosAlquileresAbiertosEnElMismoAuto:
    def test_cerrar_el_nuevo_y_despues_el_viejo(self, db, usuario, vehiculo, dos_alquileres_abiertos):
        a1, a2 = dos_alquileres_abiertos
        _checkin(db, usuario, a2, fecha=date(2026, 10, 10), km=11_000)
        # El otro sigue afuera: el auto no puede figurar disponible.
        assert vehiculo.estado == "alquilado"

        _checkin(db, usuario, a1, fecha=date(2026, 10, 5), km=10_500)
        assert a1.checkin_fecha == date(2026, 10, 5)
        assert vehiculo.estado == "disponible"

    def test_cerrar_el_viejo_y_despues_el_nuevo(self, db, usuario, vehiculo, dos_alquileres_abiertos):
        a1, a2 = dos_alquileres_abiertos
        _checkin(db, usuario, a1, fecha=date(2026, 10, 5), km=10_500)
        assert vehiculo.estado == "alquilado"
        _checkin(db, usuario, a2, fecha=date(2026, 10, 10), km=11_000)
        assert vehiculo.estado == "disponible"


class TestElAutoFiguraEnOtroEstado:
    @pytest.mark.parametrize("estado", ["disponible", "reservado", "en_transicion"])
    def test_el_checkin_pasa_igual(self, db, usuario, vehiculo, hacer_reserva, hacer_alquiler, estado):
        a = hacer_alquiler(hacer_reserva(estado="activa"))
        vehiculo.estado = estado
        db.flush()
        _checkin(db, usuario, a, fecha=date(2026, 9, 5), km=10_400)
        assert a.reserva.estado == "finalizada"
        assert vehiculo.estado == "disponible"

    def test_fuera_de_servicio_no_se_reactiva_solo(self, db, usuario, vehiculo, hacer_reserva, hacer_alquiler):
        a = hacer_alquiler(hacer_reserva(estado="activa"))
        vehiculo.estado = "fuera_de_servicio"
        db.flush()
        _checkin(db, usuario, a, fecha=date(2026, 9, 5), km=10_400)
        assert a.reserva.estado == "finalizada"
        assert vehiculo.estado == "fuera_de_servicio"


class TestReintentarNoCobraDosVeces:
    def test_el_segundo_checkin_dice_que_ya_esta_y_no_asienta_otro_pago(
        self, db, usuario, cliente, vehiculo, hacer_reserva, hacer_alquiler
    ):
        a = hacer_alquiler(hacer_reserva(estado="activa"))
        vehiculo.estado = "alquilado"
        db.flush()
        pago = PagoInmediato(monto=Decimal("50000"), medio_pago="efectivo", fecha=date(2026, 9, 5))

        _checkin(db, usuario, a, fecha=date(2026, 9, 5), km=10_400, pago=pago)
        with pytest.raises(ConflictError, match="checkin_ya_registrado"):
            _checkin(db, usuario, a, fecha=date(2026, 9, 5), km=10_400, pago=pago)

        assert db.query(Pago).filter(Pago.alquiler_id == a.id).count() == 1


class TestCheckoutFueraDeServicio:
    def test_es_un_error_de_negocio_y_no_un_500(self, db, usuario, vehiculo, hacer_reserva):
        r = hacer_reserva(estado="confirmada")
        vehiculo.estado = "fuera_de_servicio"
        db.flush()
        with pytest.raises(BusinessRuleError, match="vehiculo_fuera_de_servicio"):
            AlquilerService(db).checkout(
                reserva_id=r.id,
                checkout_fecha=date(2026, 9, 1),
                checkout_hora=time(10, 0),
                checkout_km=10_000,
                checkout_combustible=100,
                checkout_descripcion=None,
                usuario_id=usuario.id,
            )


class TestUnErrorInesperadoLlegaAlNavegador:
    def test_el_500_trae_cors_y_un_texto(self, client, monkeypatch):
        """
        Si el 500 sale sin `Access-Control-Allow-Origin`, el navegador lo
        descarta y la pantalla dice "se cortó la conexión" en vez del error.
        """
        from app.config import settings

        def _explota(*_a, **_k):
            raise RuntimeError("algo que nadie previó")

        monkeypatch.setattr(AlquilerService, "checkin", _explota)
        resp = client.post(
            "/api/v1/alquileres/1/checkin",
            json={
                "checkin_fecha": "2026-10-15",
                "checkin_hora": "12:00",
                "checkin_km": 10_000,
                "checkin_combustible": 100,
                "decision_excedente": "cobrar_completo",
            },
            headers={"Origin": settings.frontend_url},
        )
        assert resp.status_code == 500
        assert resp.headers.get("access-control-allow-origin") == settings.frontend_url
        assert "Error interno del servidor" in resp.json()["detail"]
