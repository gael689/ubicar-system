"""
Corregir un check-in ya hecho: los datos sí, la plata no.

**El caso (28/10/2026):** *"¿Se puede modificar un check-in? O sea, cuando se
pone en gris y quedó un dato mal, ¿se puede cambiar?"* — no se podía: el
segundo check-in rebota con `checkin_ya_registrado` y no había otro camino.

La regla es la misma que para editar una reserva (27/09): corregir no cobra ni
devuelve nada. Si la hora nueva cambia lo que correspondía cobrar, se avisa y
lo decide una persona aparte.
"""
from datetime import date, time
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.domain.enums import DecisionExcedente
from app.models.auditoria import Auditoria
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.services.alquiler_service import AlquilerService


def _checkin(db, usuario, alquiler, *, hora=time(10, 0), decision=DecisionExcedente.COBRAR_COMPLETO, motivo=None):
    return AlquilerService(db).checkin(
        alquiler_id=alquiler.id,
        checkin_fecha=date(2026, 9, 5),
        checkin_hora=hora,
        checkin_km=10_400,
        checkin_combustible=100,
        checkin_descripcion=None,
        decision_excedente=decision,
        motivo_bonificacion=motivo,
        usuario_id=usuario.id,
    )


def _corregir(db, usuario, alquiler, *, hora=time(14, 45), km=10_400, fecha=date(2026, 9, 5)):
    return AlquilerService(db).corregir_checkin(
        alquiler_id=alquiler.id,
        checkin_fecha=fecha,
        checkin_hora=hora,
        checkin_km=km,
        checkin_combustible=75,
        checkin_descripcion="Rayón en la puerta",
        checkin_estado_limpieza="limpio",
        usuario_id=usuario.id,
    )


@pytest.fixture
def devuelto(db, usuario, vehiculo, hacer_reserva, hacer_alquiler):
    a = hacer_alquiler(hacer_reserva(estado="activa"))
    vehiculo.estado = "alquilado"
    db.flush()
    _checkin(db, usuario, a)
    return a


def _movimientos(db, alquiler):
    return db.query(MovimientoCuentaCorriente).filter(
        MovimientoCuentaCorriente.alquiler_id == alquiler.id
    ).count()


class TestCorregirLosDatos:
    def test_cambia_hora_km_combustible_y_descripcion(self, db, usuario, devuelto):
        alquiler, _ = _corregir(db, usuario, devuelto, km=10_450)
        assert alquiler.checkin_hora == time(14, 45)
        assert alquiler.checkin_km == 10_450
        assert alquiler.checkin_combustible == 75
        assert alquiler.checkin_descripcion == "Rayón en la puerta"

    def test_la_reserva_trae_la_devolucion_real(self, db, usuario, devuelto):
        _corregir(db, usuario, devuelto)
        assert devuelto.reserva.checkin_hora == time(14, 45)
        assert devuelto.reserva.checkin_horas_excedidas > 0

    def test_queda_en_la_auditoria_con_el_antes_y_el_despues(self, db, usuario, devuelto):
        _corregir(db, usuario, devuelto)
        registro = db.query(Auditoria).filter(
            Auditoria.entidad_tipo == "alquiler", Auditoria.entidad_id == devuelto.id,
            Auditoria.accion == "editar",
        ).one()
        assert registro.datos_antes["checkin_hora"] == "10:00"
        assert registro.datos_despues["checkin_hora"] == "14:45"

    def test_sin_cambios_no_audita_nada(self, db, usuario, devuelto):
        AlquilerService(db).corregir_checkin(
            alquiler_id=devuelto.id, checkin_fecha=date(2026, 9, 5), checkin_hora=time(10, 0),
            checkin_km=10_400, checkin_combustible=100, checkin_descripcion=None,
            checkin_estado_limpieza=devuelto.checkin_estado_limpieza, usuario_id=usuario.id,
        )
        assert db.query(Auditoria).filter(Auditoria.accion == "editar").count() == 0


class TestNoTocaLaPlata:
    def test_no_cobra_el_excedente_nuevo_pero_avisa_cuanto_correspondia(self, db, usuario, devuelto):
        movimientos_antes = _movimientos(db, devuelto)
        alquiler, correspondia = _corregir(db, usuario, devuelto)
        assert alquiler.cargo_excedente == Decimal("0")
        assert _movimientos(db, devuelto) == movimientos_antes
        assert correspondia is not None and correspondia > 0

    def test_si_se_bonifico_no_hay_aviso(self, db, usuario, vehiculo, hacer_reserva, hacer_alquiler):
        a = hacer_alquiler(hacer_reserva(estado="activa"))
        vehiculo.estado = "alquilado"
        db.flush()
        _checkin(db, usuario, a, hora=time(13, 45),
                 decision=DecisionExcedente.NO_COBRAR, motivo="Sin cargo adicional")
        _, correspondia = _corregir(db, usuario, a, hora=time(14, 45))
        assert correspondia is None
        assert a.cargo_excedente == Decimal("0")


class TestElKmDelAuto:
    def test_se_corrige_si_sigue_siendo_el_de_este_checkin(self, db, usuario, vehiculo, devuelto):
        _corregir(db, usuario, devuelto, km=10_450)
        assert vehiculo.km_actual == 10_450

    def test_no_se_pisa_si_el_auto_ya_anduvo_despues(self, db, usuario, vehiculo, devuelto):
        vehiculo.km_actual = 12_000
        db.flush()
        _corregir(db, usuario, devuelto, km=10_450)
        assert vehiculo.km_actual == 12_000


class TestValidaciones:
    def test_sin_checkin_no_hay_nada_que_corregir(self, db, usuario, hacer_reserva, hacer_alquiler):
        a = hacer_alquiler(hacer_reserva(estado="activa"))
        with pytest.raises(BusinessRuleError, match="checkin_no_registrado"):
            _corregir(db, usuario, a)

    def test_km_menor_al_de_salida(self, db, usuario, devuelto):
        with pytest.raises(BusinessRuleError, match="km_invalidos"):
            _corregir(db, usuario, devuelto, km=9_000)

    def test_antes_de_la_entrega(self, db, usuario, devuelto):
        with pytest.raises(BusinessRuleError, match="checkin_antes_checkout"):
            _corregir(db, usuario, devuelto, fecha=date(2026, 8, 30))
