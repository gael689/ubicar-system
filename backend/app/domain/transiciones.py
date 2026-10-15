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
Checkin (sin próxima reserva)   | cualquiera menos fuera_de_servicio   | disponible
Checkin (próxima reserva <4hs)  | cualquiera menos fuera_de_servicio   | en_transicion
Checkin (otro alquiler abierto) | cualquiera                           | alquilado
Checkin                         | fuera_de_servicio                    | sin cambio
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
    otro_alquiler_abierto: bool = False,
) -> EstadoVehiculo:
    """
    Estado del vehículo después del checkin (devolución del cliente).

    **Nunca rechaza.** El auto ya volvió: el check-in registra un hecho, y el
    estado del vehículo es una etiqueta derivada que tiene que acomodarse a
    él, no al revés. Antes exigía `alquilado` y tiraba `ValueError` con
    cualquier otro estado — un error que ningún router traducía, así que el
    servidor devolvía un 500 sin cabeceras de CORS y el mostrador leía "Se
    cortó la conexión antes de la respuesta" (15/10/2026, dos de seis
    check-ins). El caso real: desde el 06/10 el mostrador puede entregar un
    auto que en el sistema todavía figura afuera (la reserva anterior sin
    check-in, ver `PLAN_MOSTRADOR_AVISA_NO_BLOQUEA_2026-10-06.md`). Con dos
    alquileres abiertos sobre el mismo auto, el primer check-in lo pasaba a
    `disponible` y el segundo explotaba.

    Args:
        estado_actual: lo que dice hoy la ficha del auto. Normalmente
            ALQUILADO, pero puede ser cualquiera (ver arriba).
        proxima_reserva_en_horas: horas hasta la próxima reserva confirmada
            del mismo vehículo. None si no hay reserva próxima.
        umbral_transicion_horas: horas de umbral para en_transicion (D3 = 4hs).
        otro_alquiler_abierto: True si el mismo auto tiene **otro** alquiler
            entregado y sin devolver. Entonces sigue `alquilado`: el que
            volvió es un alquiler, no el auto.
    """
    if otro_alquiler_abierto:
        return EstadoVehiculo.ALQUILADO

    # Alguien lo sacó de servicio a mano mientras estaba afuera (taller,
    # siniestro): que vuelva no lo reactiva. Eso lo decide una persona.
    if estado_actual == EstadoVehiculo.FUERA_DE_SERVICIO:
        return EstadoVehiculo.FUERA_DE_SERVICIO

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
