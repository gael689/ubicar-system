"""
Un problema abierto es UN aviso, no uno por día.

**El reporte:** *"hay demasiadas notificaciones, siempre tienen +99 […] no todos
los días un aviso de algo que no se hizo el día anterior, sino más lento."*

Las reglas de estado continuo (service vencido, límite de crédito…) ponen `fecha_objetivo = hoy`, y la clave de dedupe lleva esa
fecha: cada día el motor veía una clave nueva y creaba **otra fila** para el
mismo problema. Descartarla o leerla sólo escondía la de ese día.
"""
from datetime import date, timedelta

import pytest

from app.models.notificacion import Notificacion
from app.services import notificacion_service as ns
from app.services.notificacion_service import NotificacionService

HOY = date.today()


def _cand(tipo="service_km_vencido", entidad_id=3, hoy=HOY, **extra):
    c = {
        "tipo": tipo, "titulo": "t", "descripcion": "d", "urgencia": "alta",
        "entidad_tipo": "categoria", "entidad_id": entidad_id,
        "url_destino": "/x", "fecha_objetivo": hoy,
    }
    c.update(extra)
    return c


@pytest.fixture
def motor(db, monkeypatch):
    """El motor con las reglas reemplazadas por una lista que el test controla."""
    estado = {"candidatos": []}
    monkeypatch.setattr(ns, "evaluar_todas", lambda _db, _hoy: list(estado["candidatos"]))

    def correr(dia, candidatos):
        estado["candidatos"] = candidatos
        r = NotificacionService(db).generar(hoy=dia)
        db.flush()
        return r
    return correr


def _activas(db, tipo="service_km_vencido"):
    return db.query(Notificacion).filter(
        Notificacion.tipo == tipo, Notificacion.estado.in_(ns.ESTADOS_ACTIVOS)
    ).all()


def test_el_mismo_problema_no_suma_una_fila_por_dia(db, motor):
    for i in range(5):
        dia = HOY + timedelta(days=i)
        motor(dia, [_cand(hoy=dia)])
    assert len(_activas(db)) == 1


def test_descartarlo_no_lo_trae_de_vuelta_manana(db, motor):
    motor(HOY, [_cand()])
    NotificacionService(db).descartar(_activas(db)[0].id)

    dia = HOY + timedelta(days=1)
    motor(dia, [_cand(hoy=dia)])
    assert _activas(db) == []


def test_si_sigue_sin_resolverse_vuelve_pasada_la_semana(db, motor):
    motor(HOY, [_cand()])
    NotificacionService(db).descartar(_activas(db)[0].id)

    dia = HOY + timedelta(days=ns.REAVISO_DIAS + 1)
    motor(dia, [_cand(hoy=dia)])
    assert len(_activas(db)) == 1


def test_cada_entidad_tiene_su_aviso(db, motor):
    motor(HOY, [_cand(entidad_id=1), _cand(entidad_id=2)])
    assert len(_activas(db)) == 2


def test_las_filas_que_ya_se_acumularon_se_colapsan(db, motor):
    """Lo que hoy tiene el sistema: una fila por cada día de la semana pasada."""
    for i in range(6):
        d = HOY - timedelta(days=i)
        db.add(Notificacion(
            tipo="service_km_vencido", titulo="t", descripcion="d", urgencia="alta",
            entidad_tipo="categoria", entidad_id=3, url_destino="/x", fecha_objetivo=d,
            clave_dedupe=f"service_km_vencido:categoria:3:{d}", estado="pendiente",
        ))
    db.flush()
    assert len(_activas(db)) == 6

    motor(HOY, [_cand()])
    assert len(_activas(db)) == 1


def test_el_escalon_nuevo_reemplaza_al_anterior(db, motor):
    """
    La deuda avisa a los 7, 15 y 30 días —no todos los días—, y cada escalón
    **reemplaza** al anterior: en la campana queda uno solo por cliente.
    """
    def cc(umbral):
        return _cand(tipo="cc_vencida", entidad_id=9, entidad_tipo="cliente",
                     fecha_objetivo=None, escalon=umbral)
    motor(HOY, [cc(7)])
    assert [n.titulo for n in _activas(db, "cc_vencida")] == ["t"]

    motor(HOY + timedelta(days=8), [cc(15)])
    activas = _activas(db, "cc_vencida")
    assert len(activas) == 1
    assert activas[0].clave_dedupe.endswith(":15")


def test_un_vencimiento_avisa_a_los_15_y_a_los_3_dias(db, motor):
    vence = HOY + timedelta(days=20)

    def vtv(escalon):
        return _cand(tipo="vtv_vencimiento", entidad_id=4, entidad_tipo="vehiculo",
                     fecha_objetivo=vence, escalon=escalon)
    motor(HOY + timedelta(days=5), [vtv(15)])
    motor(HOY + timedelta(days=6), [vtv(15)])   # al día siguiente: nada nuevo
    assert len(_activas(db, "vtv_vencimiento")) == 1

    motor(HOY + timedelta(days=17), [vtv(3)])
    activas = _activas(db, "vtv_vencimiento")
    assert len(activas) == 1 and activas[0].clave_dedupe.endswith(":3")


def test_dos_documentos_del_mismo_auto_son_dos_avisos(db, motor):
    def doc(dias):
        return _cand(tipo="doc_vehiculo_por_vencer", entidad_id=4, entidad_tipo="vehiculo",
                     fecha_objetivo=HOY + timedelta(days=dias), escalon=15)
    motor(HOY, [doc(10), doc(12)])
    assert len(_activas(db, "doc_vehiculo_por_vencer")) == 2


def test_el_resumen_actualiza_su_numero(db, motor):
    motor(HOY, [_cand(tipo="datos_por_completar", entidad_id=0, titulo="Hay 3 dato(s) por completar")])
    motor(HOY + timedelta(days=1), [_cand(tipo="datos_por_completar", entidad_id=0,
                                          hoy=HOY + timedelta(days=1),
                                          titulo="Hay 2 dato(s) por completar")])
    activas = _activas(db, "datos_por_completar")
    assert len(activas) == 1 and activas[0].titulo == "Hay 2 dato(s) por completar"


def test_lo_redundante_ya_no_esta_en_el_catalogo():
    from app.domain.notificaciones_reglas import REGLAS
    nombres = {r.__name__ for r in REGLAS}
    assert not nombres & {
        "entregas_hoy", "devoluciones_hoy", "echeq_rechazado", "reserva_pendiente_24hs",
        "factura_pendiente_emitir", "multa_imputada_sin_cobrar", "contrato_firmado_sin_ver",
        "categoria_sin_precio", "cliente_sin_completar",
    }
    assert "datos_por_completar" in nombres


class TestLosUmbralesDeVencimiento:
    """VTV, póliza y documentos avisan a los 15 y a los 3 días. Ni 30, ni 7, ni 1."""

    @staticmethod
    def _auto():
        from types import SimpleNamespace
        return SimpleNamespace(id=1, patente="AA111AA", marca="Fiat", modelo="Cronos")

    def _escalon(self, dias):
        from app.domain.notificaciones_reglas import _reglas_vencimiento_vehiculo
        avisos = _reglas_vencimiento_vehiculo(
            [self._auto()], HOY, "vtv_vencimiento", "VTV",
            lambda _v: HOY + timedelta(days=dias),
        )
        return [a.get("escalon") for a in avisos]

    def test_a_un_mes_no_avisa(self):
        assert self._escalon(30) == []
        assert self._escalon(16) == []

    def test_a_los_15_dias_avisa(self):
        assert self._escalon(15) == [15]
        assert self._escalon(8) == [15]     # el día 7, 8, 9: sigue siendo el mismo aviso

    def test_a_los_3_dias_avisa_de_nuevo(self):
        assert self._escalon(3) == [3]
        assert self._escalon(1) == [3]

    def test_vencida_sigue_avisando(self):
        from app.domain.notificaciones_reglas import _reglas_vencimiento_vehiculo
        avisos = _reglas_vencimiento_vehiculo(
            [self._auto()], HOY, "vtv_vencimiento", "VTV",
            lambda _v: HOY - timedelta(days=2),
        )
        assert avisos[0]["urgencia"] == "critica"
