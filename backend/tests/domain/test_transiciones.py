"""
Tests del dominio: transiciones de estado del vehículo.
Cubre la tabla completa D3.
"""
import pytest

from app.domain.enums import EstadoVehiculo
from app.domain.transiciones import (
    estado_tras_confirmar_reserva,
    estado_tras_cancelar_reserva_confirmada,
    puede_hacer_checkout,
    estado_tras_checkout,
    estado_tras_checkin,
    estado_tras_inactivar,
    puede_reactivar,
)


class TestConfirmarReserva:
    def test_disponible_pasa_a_reservado(self):
        assert estado_tras_confirmar_reserva(EstadoVehiculo.DISPONIBLE) == EstadoVehiculo.RESERVADO

    def test_alquilado_no_cambia(self):
        assert estado_tras_confirmar_reserva(EstadoVehiculo.ALQUILADO) == EstadoVehiculo.ALQUILADO

    def test_reservado_no_cambia(self):
        assert estado_tras_confirmar_reserva(EstadoVehiculo.RESERVADO) == EstadoVehiculo.RESERVADO

    def test_en_transicion_no_cambia(self):
        assert estado_tras_confirmar_reserva(EstadoVehiculo.EN_TRANSICION) == EstadoVehiculo.EN_TRANSICION


class TestCancelarReservaConfirmada:
    def test_reservado_sin_otras_pasa_a_disponible(self):
        assert (
            estado_tras_cancelar_reserva_confirmada(EstadoVehiculo.RESERVADO, False)
            == EstadoVehiculo.DISPONIBLE
        )

    def test_reservado_con_otras_permanece_reservado(self):
        assert (
            estado_tras_cancelar_reserva_confirmada(EstadoVehiculo.RESERVADO, True)
            == EstadoVehiculo.RESERVADO
        )

    def test_alquilado_no_cambia(self):
        assert (
            estado_tras_cancelar_reserva_confirmada(EstadoVehiculo.ALQUILADO, False)
            == EstadoVehiculo.ALQUILADO
        )


class TestCheckout:
    def test_puede_desde_disponible(self):
        assert puede_hacer_checkout(EstadoVehiculo.DISPONIBLE) is True

    def test_puede_desde_reservado(self):
        assert puede_hacer_checkout(EstadoVehiculo.RESERVADO) is True

    def test_puede_desde_en_transicion(self):
        assert puede_hacer_checkout(EstadoVehiculo.EN_TRANSICION) is True

    def test_no_puede_desde_alquilado(self):
        assert puede_hacer_checkout(EstadoVehiculo.ALQUILADO) is False

    def test_no_puede_desde_fuera_de_servicio(self):
        assert puede_hacer_checkout(EstadoVehiculo.FUERA_DE_SERVICIO) is False

    def test_resultado_es_alquilado(self):
        assert estado_tras_checkout(EstadoVehiculo.DISPONIBLE) == EstadoVehiculo.ALQUILADO
        assert estado_tras_checkout(EstadoVehiculo.RESERVADO) == EstadoVehiculo.ALQUILADO
        assert estado_tras_checkout(EstadoVehiculo.EN_TRANSICION) == EstadoVehiculo.ALQUILADO

    def test_checkout_desde_fuera_de_servicio_lanza_error(self):
        with pytest.raises(ValueError):
            estado_tras_checkout(EstadoVehiculo.FUERA_DE_SERVICIO)


class TestCheckin:
    def test_sin_proxima_reserva_pasa_a_disponible(self):
        assert (
            estado_tras_checkin(EstadoVehiculo.ALQUILADO, None)
            == EstadoVehiculo.DISPONIBLE
        )

    def test_proxima_en_3h59_pasa_a_en_transicion(self):
        """3h 59min < 4h → en_transicion."""
        assert (
            estado_tras_checkin(EstadoVehiculo.ALQUILADO, proxima_reserva_en_horas=3.983)
            == EstadoVehiculo.EN_TRANSICION
        )

    def test_proxima_exactamente_en_4h_pasa_a_disponible(self):
        """Exactamente 4h → NO en_transicion (límite excluido)."""
        assert (
            estado_tras_checkin(EstadoVehiculo.ALQUILADO, proxima_reserva_en_horas=4.0)
            == EstadoVehiculo.DISPONIBLE
        )

    def test_proxima_en_4h_01_pasa_a_disponible(self):
        assert (
            estado_tras_checkin(EstadoVehiculo.ALQUILADO, proxima_reserva_en_horas=4.017)
            == EstadoVehiculo.DISPONIBLE
        )

    def test_proxima_en_0h_pasa_a_en_transicion(self):
        """Reserva inminente → en_transicion."""
        assert (
            estado_tras_checkin(EstadoVehiculo.ALQUILADO, proxima_reserva_en_horas=0.0)
            == EstadoVehiculo.EN_TRANSICION
        )

    def test_checkin_desde_no_alquilado_lanza_error(self):
        with pytest.raises(ValueError):
            estado_tras_checkin(EstadoVehiculo.DISPONIBLE, None)


class TestInactivarReactivar:
    def test_inactivar_desde_cualquier_estado(self):
        for estado in EstadoVehiculo:
            assert estado_tras_inactivar(estado) == EstadoVehiculo.FUERA_DE_SERVICIO

    def test_puede_reactivar_solo_desde_fuera_de_servicio(self):
        assert puede_reactivar(EstadoVehiculo.FUERA_DE_SERVICIO) is True

    def test_no_puede_reactivar_desde_otros(self):
        for estado in [EstadoVehiculo.DISPONIBLE, EstadoVehiculo.ALQUILADO,
                       EstadoVehiculo.RESERVADO, EstadoVehiculo.EN_TRANSICION]:
            assert puede_reactivar(estado) is False
