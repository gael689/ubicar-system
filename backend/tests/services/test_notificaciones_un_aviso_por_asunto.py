"""
Un asunto es UN aviso en la campana (pedido del 27/09/2026).

El cliente no quiere avisos repetidos en días seguidos. Los casos que hacían
ruido eran:

- una reserva web: el aviso instantáneo al entrar + la regla que la seguía
  reclamando (sin asignar, esperando la transferencia) = dos o tres filas;
- un contrato sin firmar: una regla antes de la entrega y otra el día que el
  auto salía, cada una con su fila;
- un echeq: "se cobra en 2 días" y "vence hoy" como dos avisos distintos;
- la firma del contrato: una buena noticia que ocupaba la campana.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.notificacion import Notificacion
from app.services import notificacion_service as ns
from app.services.notificacion_service import NotificacionService

HOY = date.today()


def _cand(tipo, entidad_id=1, entidad_tipo="reserva", urgencia="alta", **extra):
    c = {
        "tipo": tipo, "titulo": "t", "descripcion": "d", "urgencia": urgencia,
        "entidad_tipo": entidad_tipo, "entidad_id": entidad_id,
        "url_destino": "/x", "fecha_objetivo": HOY,
    }
    c.update(extra)
    return c


@pytest.fixture
def motor(db, monkeypatch):
    estado = {"candidatos": []}
    monkeypatch.setattr(ns, "evaluar_todas", lambda _db, _hoy: list(estado["candidatos"]))

    def correr(dia, candidatos):
        estado["candidatos"] = candidatos
        r = NotificacionService(db).generar(hoy=dia)
        db.flush()
        return r
    return correr


def _activas(db, entidad_id=None):
    q = db.query(Notificacion).filter(Notificacion.estado.in_(ns.ESTADOS_ACTIVOS))
    if entidad_id is not None:
        q = q.filter(Notificacion.entidad_id == entidad_id)
    return q.all()


def _aviso_instantaneo(db, reserva_id=1):
    return NotificacionService(db).generar_una(_cand("reserva_web_nueva", entidad_id=reserva_id))


class TestUnaReservaWebEsUnAviso:
    def test_con_el_aviso_instantaneo_abierto_la_regla_no_suma_otra_fila(self, db, motor):
        _aviso_instantaneo(db)
        motor(HOY, [_cand("reserva_web_sin_asignar")])
        assert [n.tipo for n in _activas(db)] == ["reserva_web_nueva"]

    def test_tampoco_la_de_la_transferencia(self, db, motor):
        _aviso_instantaneo(db)
        motor(HOY, [_cand("reserva_web_esperando_transferencia")])
        assert len(_activas(db)) == 1

    def test_las_filas_duplicadas_que_ya_estaban_se_resuelven(self, db, motor):
        # Lo que hoy tiene el sistema: la regla ya había creado su fila.
        motor(HOY, [_cand("reserva_web_sin_asignar")])
        _aviso_instantaneo(db)
        motor(HOY, [_cand("reserva_web_sin_asignar")])
        assert [n.tipo for n in _activas(db)] == ["reserva_web_nueva"]

    def test_descartar_el_instantaneo_no_hace_nacer_la_regla(self, db, motor):
        n = _aviso_instantaneo(db)
        NotificacionService(db).descartar(n.id)
        motor(HOY, [_cand("reserva_web_sin_asignar")])
        assert _activas(db) == []

    def test_sin_aviso_instantaneo_la_regla_es_la_red_de_seguridad(self, db, motor):
        motor(HOY, [_cand("reserva_web_sin_asignar")])
        assert [n.tipo for n in _activas(db)] == ["reserva_web_sin_asignar"]

    def test_resuelto_el_instantaneo_la_regla_vuelve_a_avisar(self, db, motor):
        # Se resolvió porque la reserva cambió (se cobró la transferencia) y
        # ahora falta otra cosa (asignarle el auto): eso sí es un aviso nuevo.
        _aviso_instantaneo(db)
        NotificacionService(db).resolver_por_entidad("reserva", 1)
        motor(HOY, [_cand("reserva_web_sin_asignar")])
        assert [n.tipo for n in _activas(db)] == ["reserva_web_sin_asignar"]

    def test_otra_reserva_no_se_ve_afectada(self, db, motor):
        _aviso_instantaneo(db, reserva_id=1)
        motor(HOY, [_cand("reserva_web_sin_asignar", entidad_id=2)])
        assert {n.entidad_id for n in _activas(db)} == {1, 2}


class TestContratoSinFirmar:
    def test_es_una_fila_que_sube_de_urgencia(self, db, motor):
        entrega = HOY + timedelta(days=3)

        def contrato(dia, urgencia, titulo):
            return _cand("contrato_no_firmado", urgencia=urgencia, titulo=titulo,
                         fecha_objetivo=entrega)

        motor(HOY, [contrato(HOY, "media", "entrega en 3 días")])
        motor(HOY + timedelta(days=2), [contrato(HOY, "alta", "entrega mañana")])
        motor(HOY + timedelta(days=3), [contrato(HOY, "alta", "el auto salió hoy")])

        activas = _activas(db)
        assert len(activas) == 1
        assert activas[0].urgencia == "alta"
        assert activas[0].titulo == "el auto salió hoy"

    def test_las_dos_reglas_viejas_ya_no_estan(self):
        from app.domain.notificaciones_reglas import REGLAS
        nombres = {r.__name__ for r in REGLAS}
        assert "contrato_sin_firmar" in nombres
        assert not nombres & {"contrato_no_firmado_entrega_hoy", "contrato_sin_firmar_entrega_proxima"}
        # El crítico (auto afuera desde ayer o antes) queda aparte.
        assert "contrato_sin_firmar_auto_afuera" in nombres


class TestEcheq:
    @pytest.fixture
    def echeq(self, db):
        from app.models.echeq import Echeq

        e = Echeq(
            tipo="recibido", monto=Decimal("140000.00"), fecha_emision=HOY,
            fecha_cobro=HOY + timedelta(days=2), estado="en_cartera",
            contraparte="Transportes Sur",
        )
        db.add(e)
        db.flush()
        return e

    def test_la_regla_avisa_dos_dias_antes_y_el_mismo_dia(self, db, echeq):
        from app.domain.notificaciones_reglas import echeq_por_cobrar

        antes = echeq_por_cobrar(db, HOY)
        assert [(a["tipo"], a["urgencia"], a["escalon"]) for a in antes] == [
            ("echeq_proximo", "alta", "proximo")
        ]
        # Sin montos crudos: "$140.000", no "140000.00".
        assert "$140.000" in antes[0]["descripcion"]

        el_dia = echeq_por_cobrar(db, HOY + timedelta(days=2))
        assert [(a["urgencia"], a["escalon"]) for a in el_dia] == [("critica", "hoy")]

        assert echeq_por_cobrar(db, HOY + timedelta(days=3)) == []

    def test_en_la_campana_es_un_solo_aviso_por_cheque(self, db, echeq, monkeypatch):
        from app.domain.notificaciones_reglas import echeq_por_cobrar

        # El motor real, con esta sola regla en el catálogo.
        monkeypatch.setattr(ns, "evaluar_todas", lambda _db, hoy: echeq_por_cobrar(_db, hoy))
        for i in range(3):
            NotificacionService(db).generar(hoy=HOY + timedelta(days=i))
            db.flush()
            activas = _activas(db, entidad_id=echeq.id)
            assert len(activas) == 1, f"día {i}: {len(activas)} avisos"

        assert _activas(db, entidad_id=echeq.id)[0].urgencia == "critica"

    def test_las_reglas_viejas_ya_no_estan(self):
        from app.domain.notificaciones_reglas import REGLAS
        nombres = {r.__name__ for r in REGLAS}
        assert "echeq_por_cobrar" in nombres
        assert not nombres & {"echeq_proximo_t2", "echeq_vence_hoy"}


class TestContratoFirmadoSoloHistorial:
    def test_nace_resuelta_y_no_suma_a_la_campana(self, db):
        svc = NotificacionService(db)
        n = svc.generar_una(
            _cand("contrato_firmado", entidad_tipo="contrato", urgencia="media"),
            solo_historial=True,
        )
        assert n.estado == "resuelta" and n.resuelta_at is not None
        assert svc.list_activas() == []
        items, total = svc.list_historial()
        assert total == 1 and items[0].tipo == "contrato_firmado"


class TestElRelojLimpiaLosHolds:
    def test_el_motor_periodico_limpia_los_holds_vencidos(self, db, monkeypatch):
        import app.main as main
        from app.services.hold_service import HoldService

        llamadas = []
        monkeypatch.setattr(main, "SessionLocal", lambda: db)
        monkeypatch.setattr(HoldService, "limpiar_vencidos", lambda self, dias=30: llamadas.append(dias) or 0)

        main._correr_motor_notificaciones()
        assert llamadas == [30]
