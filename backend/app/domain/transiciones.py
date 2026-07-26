from __future__ import annotations
"""
Funciones puras de transición de estado del vehículo.
Sin dependencias externas — testeable de forma aislada.

Tabla completa de transiciones (D3):

Evento                          | Estado origen permitido              | Estado destino
------------------------------- | ------------------------------------ | --------------
Reserva confirmada              | disponible                           | reservado
Reserva confirmada              | alquilado, reservado, en_transicion  | sin cambio
Cancelar reserva confirmada     | reservado (si es la única activa)    | disponible
Cancelar reserva confirmada     | reservado (con otras activas)        | sin cambio
Checkout                        | disponible, reservado, en_transicion | alquilado
Checkin (sin próxima reserva)   | alquilado                            | disponible
Checkin (próxima reserva <4hs)  | alquilado                            | en_transicion
Admin fuera de servicio         | cualquiera                           | fuera_de_servicio
Admin reactiva                  | fuera_de_servicio                    | disponible
"""
from app.domain.enums import EstadoVehiculo


def estado_tras_confirmar_reserva(
    estado_actual: EstadoVehiculo,
) -> EstadoVehiculo:
    """
    Estado del vehículo después de confirmar una reserva.
    Solo cambia si estaba disponible.
    """
    if estado_actual == EstadoVehiculo.DISPONIBLE:
        return EstadoVehiculo.RESERVADO
    # alquilado, reservado, en_transicion, fuera_de_servicio → sin cambio
    return estado_actual


def estado_tras_cancelar_reserva_confirmada(
    estado_actual: EstadoVehiculo,
    tiene_otras_reservas_confirmadas: bool,
) -> EstadoVehiculo:
    """
    Estado del vehículo después de cancelar una reserva confirmada.

    Args:
        tiene_otras_reservas_confirmadas: True si hay otras reservas confirmadas
            activas para el mismo vehículo (excluyendo la que se cancela).
    """
    if estado_actual == EstadoVehiculo.RESERVADO and not tiene_otras_reservas_confirmadas:
        return EstadoVehiculo.DISPONIBLE
    return estado_actual


def puede_hacer_checkout(estado_actual: EstadoVehiculo) -> bool:
    """True si el vehículo puede recibir un checkout (salida del cliente)."""
    return estado_actual in {
        EstadoVehiculo.DISPONIBLE,
        EstadoVehiculo.RESERVADO,
        EstadoVehiculo.EN_TRANSICION,
    }


def estado_tras_checkout(estado_actual: EstadoVehiculo) -> EstadoVehiculo:
    """Estado del vehículo después del checkout."""
    if not puede_hacer_checkout(estado_actual):
        raise ValueError(
            f"No se puede hacer checkout desde el estado '{estado_actual.value}'"
        )
    return EstadoVehiculo.ALQUILADO


def estado_tras_checkin(
    estado_actual: EstadoVehiculo,
    proxima_reserva_en_horas: float | None,
    umbral_transicion_horas: float = 4.0,
) -> EstadoVehiculo:
    """
    Estado del vehículo después del checkin (devolución del cliente).

    Args:
        estado_actual: debe ser ALQUILADO.
        proxima_reserva_en_horas: horas hasta la próxima reserva confirmada
            del mismo vehículo. None si no hay reserva próxima.
        umbral_transicion_horas: horas de umbral para en_transicion (D3 = 4hs).
    """
    if estado_actual != EstadoVehiculo.ALQUILADO:
        raise ValueError(
            f"No se puede hacer checkin desde el estado '{estado_actual.value}'"
        )

    if (
        proxima_reserva_en_horas is not None
        and 0 <= proxima_reserva_en_horas < umbral_transicion_horas
    ):
        return EstadoVehiculo.EN_TRANSICION

    return EstadoVehiculo.DISPONIBLE


def estado_tras_inactivar(estado_actual: EstadoVehiculo) -> EstadoVehiculo:
    """Admin marca fuera de servicio — desde cualquier estado."""
    return EstadoVehiculo.FUERA_DE_SERVICIO


def puede_reactivar(estado_actual: EstadoVehiculo) -> bool:
    """True si el vehículo puede ser reactivado por el admin."""
    return estado_actual == EstadoVehiculo.FUERA_DE_SERVICIO
