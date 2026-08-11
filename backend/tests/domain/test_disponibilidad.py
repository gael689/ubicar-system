"""
Tests del cálculo de cupo por categoría (domain/disponibilidad.py).

El caso que más importa es `test_reserva_por_categoria_sin_vehiculo_ocupa`:
es el que produce sobreventa si se olvida, porque una reserva web sin auto
asignado no aparece en el solapamiento de ningún vehículo pero ya está vendida.
"""
from datetime import datetime, timedelta

import pytest

from app.domain.disponibilidad import (
    CupoCategoria,
    OcupacionCategoria,
    VehiculoDisponible,
    calcular_cupo,
    calcular_cupos,
    dias_de_alquiler,
    solapa,
    validar_rango_web,
)


# Flota de prueba: 3 compactos (cat 1) y 2 pick-ups (cat 5).
FLOTA = [
    VehiculoDisponible(id=1, categoria_id=1),
    VehiculoDisponible(id=2, categoria_id=1),
    VehiculoDisponible(id=3, categoria_id=1),
    VehiculoDisponible(id=10, categoria_id=5),
    VehiculoDisponible(id=11, categoria_id=5),
]

INICIO = datetime(2026, 9, 3, 10, 0)
FIN = datetime(2026, 9, 10, 10, 0)


def ocup(**kw) -> OcupacionCategoria:
    base = dict(inicio=INICIO, fin=FIN)
    base.update(kw)
    return OcupacionCategoria(**base)


class TestCalcularCupo:
    def test_sin_ocupaciones_todo_libre(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [])
        assert c.total == 3
        assert c.disponibles == 3
        assert c.vehiculos_libres == [1, 2, 3]

    def test_reserva_con_vehiculo_descuenta_uno(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(vehiculo_id=1)])
        assert c.disponibles == 2
        assert c.vehiculos_libres == [2, 3]

    def test_reserva_por_categoria_sin_vehiculo_ocupa(self):
        """
        El caso que produce sobreventa si se olvida: la reserva web todavía no
        tiene auto asignado, pero la unidad ya está vendida.
        """
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(categoria_id=1)])
        assert c.disponibles == 2
        # No se sabe cuál auto, así que los 3 siguen "libres" para asignar.
        assert c.vehiculos_libres == [1, 2, 3]

    def test_mezcla_de_ambos_tipos(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1),
            ocup(categoria_id=1),
        ])
        assert c.disponibles == 1

    def test_bloqueo_descuenta(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(vehiculo_id=2, origen="bloqueo")])
        assert c.disponibles == 2
        assert 2 not in c.vehiculos_libres

    def test_hold_descuenta(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(categoria_id=1, origen="hold")])
        assert c.disponibles == 2

    def test_el_mismo_auto_ocupado_dos_veces_cuenta_una(self):
        """Reserva + bloqueo sobre el mismo auto no puede descontar 2 unidades."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1),
            ocup(vehiculo_id=1, origen="bloqueo"),
        ])
        assert c.disponibles == 2

    def test_ocupacion_de_otra_categoria_no_afecta(self):
        """Bloquear una pick-up no baja el cupo de los compactos."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=10, origen="bloqueo"),
            ocup(categoria_id=5),
        ])
        assert c.disponibles == 3

    def test_ocupacion_fuera_del_rango_no_afecta(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1,
                 inicio=datetime(2026, 10, 1), fin=datetime(2026, 10, 5)),
        ])
        assert c.disponibles == 3

    def test_ocupacion_adyacente_no_solapa(self):
        """El auto vuelve el 3 a las 10:00 y sale de nuevo a las 10:00."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1, inicio=datetime(2026, 9, 1, 10, 0), fin=INICIO),
        ])
        assert c.disponibles == 3

    def test_sin_cupo(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [
            ocup(vehiculo_id=1), ocup(vehiculo_id=2), ocup(vehiculo_id=3),
        ])
        assert c.disponibles == 0
        assert not c.hay_cupo

    def test_nunca_negativo(self):
        """Si algo quedó mal cargado, 0 es la respuesta segura — nunca -1."""
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(categoria_id=1) for _ in range(5)])
        assert c.disponibles == 0

    def test_ultima_unidad(self):
        c = calcular_cupo(1, INICIO, FIN, FLOTA, [ocup(vehiculo_id=1), ocup(vehiculo_id=2)])
        assert c.ultima_unidad
        assert c.hay_cupo

    def test_categoria_sin_autos(self):
        c = calcular_cupo(99, INICIO, FIN, FLOTA, [])
        assert c.total == 0
        assert not c.hay_cupo

    def test_vehiculo_sin_categoria_no_suma_a_ninguna(self):
        """Los 9 autos sin categoría asignada no deben inflar ningún cupo."""
        flota = FLOTA + [VehiculoDisponible(id=50, categoria_id=None)]
        assert calcular_cupo(1, INICIO, FIN, flota, []).total == 3


class TestCalcularCupos:
    def test_todas_las_categorias(self):
        cupos = calcular_cupos(INICIO, FIN, FLOTA, [])
        assert [c.categoria_id for c in cupos] == [1, 5]
        assert [c.disponibles for c in cupos] == [3, 2]

    def test_filtra_por_categoria(self):
        cupos = calcular_cupos(INICIO, FIN, FLOTA, [], categoria_ids=[5])
        assert len(cupos) == 1
        assert cupos[0].categoria_id == 5


class TestValidarRangoWeb:
    AHORA = datetime(2026, 9, 1, 12, 0)

    def _validar(self, inicio, fin, **kw):
        validar_rango_web(inicio, fin, self.AHORA, **kw)

    def test_rango_valido(self):
        self._validar(datetime(2026, 9, 5, 10, 0), datetime(2026, 9, 8, 10, 0))

    def test_fin_antes_del_inicio(self):
        with pytest.raises(ValueError, match="posterior"):
            self._validar(datetime(2026, 9, 8), datetime(2026, 9, 5))

    def test_en_el_pasado(self):
        with pytest.raises(ValueError, match="ya pasó"):
            self._validar(datetime(2026, 8, 1), datetime(2026, 8, 5))

    def test_sin_anticipacion_suficiente(self):
        """Reservar hoy para mañana temprano: el auto no llega a estar listo."""
        with pytest.raises(ValueError, match="anticipación"):
            self._validar(datetime(2026, 9, 1, 20, 0), datetime(2026, 9, 5))

    def test_anticipacion_configurable(self):
        # Con 2 h de mínimo, el mismo rango que fallaba ahora pasa.
        self._validar(
            datetime(2026, 9, 1, 20, 0), datetime(2026, 9, 5),
            anticipacion_minima_horas=2,
        )

    def test_duracion_maxima(self):
        with pytest.raises(ValueError, match="contactanos"):
            self._validar(datetime(2026, 9, 5), datetime(2027, 9, 5))


class TestHelpers:
    def test_solapa(self):
        assert solapa(datetime(2026, 9, 1), datetime(2026, 9, 5),
                      datetime(2026, 9, 3), datetime(2026, 9, 8))
        assert not solapa(datetime(2026, 9, 1), datetime(2026, 9, 5),
                          datetime(2026, 9, 5), datetime(2026, 9, 8))

    def test_dias_de_alquiler_no_cuenta_el_dia_de_devolucion(self):
        from datetime import date
        assert dias_de_alquiler(date(2026, 9, 3), date(2026, 9, 10)) == 7


# ─── Holds (ítem 61) ─────────────────────────────────────────────────────────

class TestHoldsOcupanCupo:
    """
    El hold es la defensa real contra la sobreventa: si no ocupa cupo mientras
    el cliente paga, dos personas compran la última unidad.

    Nota: la expiración no se evalúa acá sino en el service, que filtra
    `expira_en > now()` antes de armar la ocupación. Es a propósito — el
    dominio no conoce el reloj, y así **un hold vencido deja de ocupar en el
    mismo instante en que vence, sin que corra ningún job**.
    """

    def test_un_hold_baja_el_cupo(self):
        hold = OcupacionCategoria(
            inicio=datetime(2026, 3, 1, 10), fin=datetime(2026, 3, 5, 10),
            categoria_id=1, origen="hold",
        )
        cupo = calcular_cupo(
            1, datetime(2026, 3, 1, 10), datetime(2026, 3, 5, 10), FLOTA, [hold]
        )
        assert cupo.disponibles == 2  # de 3 compactos

    def test_varios_holds_pueden_agotar_la_categoria(self):
        holds = [
            OcupacionCategoria(
                inicio=datetime(2026, 3, 1, 10), fin=datetime(2026, 3, 5, 10),
                categoria_id=1, origen="hold",
            )
            for _ in range(3)
        ]
        cupo = calcular_cupo(
            1, datetime(2026, 3, 1, 10), datetime(2026, 3, 5, 10), FLOTA, holds
        )
        assert cupo.disponibles == 0

    def test_un_hold_de_otra_categoria_no_afecta(self):
        hold = OcupacionCategoria(
            inicio=datetime(2026, 3, 1, 10), fin=datetime(2026, 3, 5, 10),
            categoria_id=5, origen="hold",
        )
        cupo = calcular_cupo(
            1, datetime(2026, 3, 1, 10), datetime(2026, 3, 5, 10), FLOTA, [hold]
        )
        assert cupo.disponibles == 3

    def test_un_hold_fuera_del_rango_no_afecta(self):
        hold = OcupacionCategoria(
            inicio=datetime(2026, 5, 1, 10), fin=datetime(2026, 5, 5, 10),
            categoria_id=1, origen="hold",
        )
        cupo = calcular_cupo(
            1, datetime(2026, 3, 1, 10), datetime(2026, 3, 5, 10), FLOTA, [hold]
        )
        assert cupo.disponibles == 3

    def test_hold_y_reserva_se_suman(self):
        """Un hold no reemplaza a la reserva: mientras existan los dos, ocupan
        los dos. Es lo que impide vender la misma unidad dos veces durante la
        ventana de pago."""
        ocupaciones = [
            OcupacionCategoria(
                inicio=datetime(2026, 3, 1, 10), fin=datetime(2026, 3, 5, 10),
                categoria_id=1, vehiculo_id=1, origen="reserva",
            ),
            OcupacionCategoria(
                inicio=datetime(2026, 3, 1, 10), fin=datetime(2026, 3, 5, 10),
                categoria_id=1, origen="hold",
            ),
        ]
        cupo = calcular_cupo(
            1, datetime(2026, 3, 1, 10), datetime(2026, 3, 5, 10), FLOTA, ocupaciones
        )
        assert cupo.disponibles == 1


# ─── Ventana de rotación (el auto que vuelve ese mismo día) ───────────────────

from app.domain.disponibilidad import (  # noqa: E402
    con_preparacion,
    proponer_entrega_por_rotacion,
)

# Una sola unidad en la categoría 9: es el caso real de una flota chica, donde
# la categoría entera rota sobre un auto.
FLOTA_UNICA = [VehiculoDisponible(id=90, categoria_id=9)]

# El cliente la pide de 08:00 del 3/9 hasta las 10:00 del 6/9.
PEDIDO_INICIO = datetime(2026, 9, 3, 8, 0)
PEDIDO_FIN = datetime(2026, 9, 6, 10, 0)


def reserva(inicio, fin, vehiculo_id=90, categoria_id=None):
    return OcupacionCategoria(
        inicio=inicio, fin=fin, vehiculo_id=vehiculo_id,
        categoria_id=categoria_id, origen="reserva",
    )


class TestVentanaDeRotacion:
    """
    El caso que hoy se pierde: la única unidad vuelve a las 10:00 y el cliente
    la pide a las 08:00 **del mismo día**. Con dos horas para limpiarla y
    revisarla, el alquiler sale a las 12:00 en vez de mostrar "sin
    disponibilidad" y perder la venta.
    """

    def test_el_caso_de_las_10_y_las_8(self):
        vuelve = datetime(2026, 9, 3, 10, 0)
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [reserva(datetime(2026, 8, 30, 10, 0), vuelve)],
        )
        assert p is not None
        assert p.entrega == datetime(2026, 9, 3, 12, 0)
        assert p.devolucion_unidad == vuelve
        assert p.margen_horas == 2

    def test_con_cupo_no_se_ofrece_nada(self):
        """
        La condición que evita empeorar una reserva que estaba bien: si hay una
        unidad libre se alquila normal, a la hora que el cliente pidió.
        """
        flota = FLOTA_UNICA + [VehiculoDisponible(id=91, categoria_id=9)]
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, flota,
            [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 10, 0))],
        )
        assert p is None

    def test_si_vuelve_al_dia_siguiente_no_se_ofrece(self):
        """Correr el retiro un día es otra reserva: otros días y otro precio."""
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 4, 10, 0))],
        )
        assert p is None

    def test_si_el_margen_cruza_la_medianoche_no_se_ofrece(self):
        """23:00 + 2 h cae al día siguiente: ya no es el mismo día."""
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 23, 0))],
        )
        assert p is None

    def test_no_se_ofrece_sobre_un_auto_que_sale_del_taller(self):
        """
        Un bloqueo no es un auto que un cliente devuelve, y además termina a
        medianoche: ofrecería una entrega a las 02:00.
        """
        bloqueo = OcupacionCategoria(
            inicio=datetime(2026, 8, 30, 0, 0), fin=datetime(2026, 9, 3, 10, 0),
            vehiculo_id=90, origen="bloqueo",
        )
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA, [bloqueo],
        )
        assert p is None

    def test_no_se_ofrece_sobre_un_hold(self):
        """Un hold que vence libera el cupo solo; no hay auto que preparar."""
        hold = OcupacionCategoria(
            inicio=datetime(2026, 8, 30, 10, 0), fin=datetime(2026, 9, 3, 10, 0),
            categoria_id=9, origen="hold",
        )
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA, [hold],
        )
        assert p is None

    def test_no_promete_un_auto_que_vuelve_a_salir(self):
        """
        **El que rompía una implementación ingenua.** El auto vuelve 10:00, así
        que "a las 12 está libre" parece cierto — pero tiene otra reserva a las
        14 del mismo día. Se consulta el cupo real de la ventana propuesta, no
        se deduce.
        """
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [
                reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 10, 0)),
                reserva(datetime(2026, 9, 3, 14, 0), datetime(2026, 9, 5, 10, 0)),
            ],
        )
        assert p is None

    def test_una_reserva_por_categoria_tambien_libera(self):
        """Sin vehículo asignado sigue siendo una unidad que vuelve."""
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 10, 0),
                     vehiculo_id=None, categoria_id=9)],
        )
        assert p is not None
        assert p.entrega == datetime(2026, 9, 3, 12, 0)

    def test_gana_la_primera_que_vuelve(self):
        """Con dos unidades ocupadas se ofrece la más temprana de las dos."""
        flota = FLOTA_UNICA + [VehiculoDisponible(id=91, categoria_id=9)]
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, flota,
            [
                reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 16, 0), 90),
                reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 9, 30), 91),
            ],
        )
        assert p is not None
        assert p.entrega == datetime(2026, 9, 3, 11, 30)

    def test_la_hora_se_redondea_a_la_media(self):
        """Un mostrador no cita a las 12:07."""
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 10, 7))],
        )
        assert p is not None
        assert p.entrega == datetime(2026, 9, 3, 12, 30)

    def test_el_margen_es_configurable(self):
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 10, 0))],
            margen_horas=4,
        )
        assert p is not None
        assert p.entrega == datetime(2026, 9, 3, 14, 0)

    def test_sin_nada_que_vuelva_sigue_siendo_que_no(self):
        """Ocupada toda la semana: no hay ventana y no se inventa una."""
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA,
            [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 20, 10, 0))],
        )
        assert p is None

    def test_la_entrega_propuesta_tiene_cupo_de_verdad(self):
        """
        La propuesta se puede tomar: pedir el hold a esa hora tiene que dar
        cupo. Es la invariante que conecta lo que la web ofrece con lo que el
        `HoldService` después acepta.
        """
        ocupaciones = [reserva(datetime(2026, 8, 30, 10, 0), datetime(2026, 9, 3, 10, 0))]
        p = proponer_entrega_por_rotacion(
            9, PEDIDO_INICIO, PEDIDO_FIN, FLOTA_UNICA, ocupaciones,
        )
        assert p is not None
        assert calcular_cupo(9, p.entrega, PEDIDO_FIN, FLOTA_UNICA, ocupaciones).hay_cupo


class TestPreparacionDelAutoQueVuelve:
    """
    Un auto que vuelve no está listo en el mismo instante en que entra.

    **Lo que se vendía mal**: `solapa()` trata los rangos adyacentes como
    compatibles —y hace bien, es la regla del calendario—, así que una unidad
    devuelta a las 10:00 figuraba libre para entregar a las 10:00. El sitio la
    vendía sin un minuto para limpiarla y el problema aparecía en el mostrador,
    con el cliente enfrente.
    """

    OCUPADA_HASTA_LAS_10 = [
        reserva(datetime(2026, 9, 1, 10, 0), datetime(2026, 9, 3, 10, 0))
    ]

    def test_sin_preparacion_el_auto_figuraba_libre_al_instante(self):
        """El comportamiento viejo, para que se vea qué cambia."""
        c = calcular_cupo(
            9, datetime(2026, 9, 3, 10, 0), PEDIDO_FIN,
            FLOTA_UNICA, self.OCUPADA_HASTA_LAS_10,
        )
        assert c.hay_cupo

    def test_con_preparacion_no_se_entrega_a_la_hora_que_vuelve(self):
        c = calcular_cupo(
            9, datetime(2026, 9, 3, 10, 0), PEDIDO_FIN, FLOTA_UNICA,
            con_preparacion(self.OCUPADA_HASTA_LAS_10, 2),
        )
        assert not c.hay_cupo

    def test_pasado_el_margen_vuelve_a_estar_libre(self):
        c = calcular_cupo(
            9, datetime(2026, 9, 3, 12, 0), PEDIDO_FIN, FLOTA_UNICA,
            con_preparacion(self.OCUPADA_HASTA_LAS_10, 2),
        )
        assert c.hay_cupo

    def test_pedir_a_la_misma_hora_que_vuelve_ofrece_la_ventana(self):
        """
        El caso del que salió la regla: pide 10:00, el auto vuelve 10:00. No es
        "sin disponibilidad" ni es entregarlo sucio a las 10 — es a las 12.
        """
        p = proponer_entrega_por_rotacion(
            9, datetime(2026, 9, 3, 10, 0), PEDIDO_FIN,
            FLOTA_UNICA, self.OCUPADA_HASTA_LAS_10,
        )
        assert p is not None
        assert p.entrega == datetime(2026, 9, 3, 12, 0)
        assert p.devolucion_unidad == datetime(2026, 9, 3, 10, 0)

    def test_pedir_despues_del_margen_se_alquila_normal(self):
        """
        Pide 14:00 y el auto vuelve 10:00: a las 14 ya está listo. No se toca
        nada — el cliente retira a la hora que pidió.
        """
        p = proponer_entrega_por_rotacion(
            9, datetime(2026, 9, 3, 14, 0), PEDIDO_FIN,
            FLOTA_UNICA, self.OCUPADA_HASTA_LAS_10,
        )
        assert p is None
        assert calcular_cupo(
            9, datetime(2026, 9, 3, 14, 0), PEDIDO_FIN, FLOTA_UNICA,
            con_preparacion(self.OCUPADA_HASTA_LAS_10, 2),
        ).hay_cupo

    def test_justo_en_el_limite_del_margen_ya_esta_listo(self):
        """Vuelve 10:00, pide 12:00: adyacente a la preparación, se entrega."""
        p = proponer_entrega_por_rotacion(
            9, datetime(2026, 9, 3, 12, 0), PEDIDO_FIN,
            FLOTA_UNICA, self.OCUPADA_HASTA_LAS_10,
        )
        assert p is None

    def test_el_bloqueo_no_necesita_preparacion(self):
        """Un auto que sale del taller ya viene revisado."""
        bloqueo = OcupacionCategoria(
            inicio=datetime(2026, 9, 1, 0, 0), fin=datetime(2026, 9, 3, 10, 0),
            vehiculo_id=90, origen="bloqueo",
        )
        assert con_preparacion([bloqueo], 2) == [bloqueo]

    def test_el_hold_no_necesita_preparacion(self):
        """Un hold que vence libera el cupo solo; no hay auto que limpiar."""
        hold = OcupacionCategoria(
            inicio=datetime(2026, 9, 1, 0, 0), fin=datetime(2026, 9, 3, 10, 0),
            categoria_id=9, origen="hold",
        )
        assert con_preparacion([hold], 2) == [hold]

    def test_margen_cero_no_cambia_nada(self):
        """Para apagar la preparación sin tocar código."""
        assert con_preparacion(self.OCUPADA_HASTA_LAS_10, 0) == self.OCUPADA_HASTA_LAS_10

    def test_lo_que_se_ofrece_es_lo_que_despues_hay(self):
        """
        La invariante que conecta las dos puntas: el horario propuesto tiene
        cupo **con la preparación contada**, que es como lo va a medir el
        `HoldService`. Si no, la web ofrecería un horario que el hold rechaza.
        """
        for pedido in (
            datetime(2026, 9, 3, 8, 0),
            datetime(2026, 9, 3, 10, 0),
            datetime(2026, 9, 3, 11, 59),
        ):
            p = proponer_entrega_por_rotacion(
                9, pedido, PEDIDO_FIN, FLOTA_UNICA, self.OCUPADA_HASTA_LAS_10,
            )
            assert p is not None, pedido
            assert calcular_cupo(
                9, p.entrega, PEDIDO_FIN, FLOTA_UNICA,
                con_preparacion(self.OCUPADA_HASTA_LAS_10, 2),
            ).hay_cupo, pedido
