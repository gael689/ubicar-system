"""
El rango con el que se buscan las ventanas candidatas.

**Por qué esto merece tests propios.** `_cargar_ventanas` traía la historia
completa del vehículo (`page_size=9999`) y filtraba en Python. Acotarlo por
fecha es la mejora obvia, y también la forma más fácil de introducir el peor
bug posible del sistema: perder una ventana que sí solapaba y aceptar una
reserva doble que nadie ve hasta el día de la entrega.

Lo que fijan estos tests es el invariante que hace segura la optimización:

    toda ventana que pueda solapar con [inicio, fin] cae dentro del rango de
    fechas que devuelve `rango_de_carga`.

Traer de más es aceptable — `detectar_solapamientos` descarta después lo que no
solapa de verdad. Traer de menos, no.
"""
from datetime import date, datetime, time, timedelta

from app.domain.solapamientos import (
    MARGEN_CARGA_DIAS,
    detectar_solapamientos,
    hay_solapamiento,
    rango_de_carga,
)
from app.domain.ventana import VentanaReserva


def _dt(d: str, h: str = "10:00") -> datetime:
    return datetime.combine(
        date.fromisoformat(d), time.fromisoformat(h)
    )


def _entra_en_el_rango(v_inicio: datetime, v_fin: datetime, desde: date, hasta: date) -> bool:
    """
    El mismo predicado que aplica el repositorio:
    `fecha_fin >= desde AND fecha_inicio <= hasta`.
    """
    return v_fin.date() >= desde and v_inicio.date() <= hasta


class TestElInvariante:
    """Si solapa, se trae. Sin excepciones."""

    def test_el_caso_que_motiva_el_margen(self):
        """
        Una reserva que termina el 9 a las 23:00 solapa con una que empieza el
        10 a las 00:30 — pero **sólo si se mira la hora**. Por fecha,
        `fecha_fin (9) >= inicio.date() (10)` es falso.

        Es exactamente la ventana que un filtro sin margen perdería, y es un
        caso real: una devolución nocturna y una entrega temprano al otro día.
        """
        pedido_inicio, pedido_fin = _dt("2026-09-10", "00:30"), _dt("2026-09-12")
        vecina_inicio, vecina_fin = _dt("2026-09-08"), _dt("2026-09-09", "23:00")

        # No solapan de verdad (la vecina termina antes), pero están tan cerca
        # que el filtro tiene que traerla igual para que el motor lo decida.
        desde, hasta = rango_de_carga(pedido_inicio, pedido_fin)
        assert _entra_en_el_rango(vecina_inicio, vecina_fin, desde, hasta)

    def test_una_ventana_que_si_solapa_por_horas_se_trae(self):
        """El mismo caso, pero solapando de verdad: termina después."""
        pedido_inicio, pedido_fin = _dt("2026-09-10", "00:30"), _dt("2026-09-12")
        vecina_inicio, vecina_fin = _dt("2026-09-08"), _dt("2026-09-10", "01:00")

        assert hay_solapamiento(pedido_inicio, pedido_fin, vecina_inicio, vecina_fin)
        desde, hasta = rango_de_carga(pedido_inicio, pedido_fin)
        assert _entra_en_el_rango(vecina_inicio, vecina_fin, desde, hasta)

    def test_barrido_toda_ventana_que_solapa_entra(self):
        """
        Barrido sobre un mes: para cada par (ventana pedida, ventana existente)
        que solapa, la existente tiene que caer en el rango de carga.

        Es el invariante completo, no un caso elegido a mano.
        """
        base = date(2026, 9, 1)
        horas = ("00:30", "10:00", "23:00")
        fallos = []

        for d_ini in range(0, 20, 3):
            for dur in (1, 2, 7):
                for h_ini in horas:
                    p_ini = datetime.combine(base + timedelta(days=d_ini), time.fromisoformat(h_ini))
                    p_fin = p_ini + timedelta(days=dur)
                    desde, hasta = rango_de_carga(p_ini, p_fin)

                    for v_off in range(-10, 25, 1):
                        for v_dur in (1, 3, 10):
                            for h_v in horas:
                                v_ini = datetime.combine(
                                    base + timedelta(days=v_off), time.fromisoformat(h_v)
                                )
                                v_fin = v_ini + timedelta(days=v_dur)
                                if not hay_solapamiento(p_ini, p_fin, v_ini, v_fin):
                                    continue
                                if not _entra_en_el_rango(v_ini, v_fin, desde, hasta):
                                    fallos.append((p_ini, p_fin, v_ini, v_fin))

        assert not fallos, f"{len(fallos)} ventanas que solapan quedaron fuera del rango: {fallos[:3]}"


class TestElMargen:
    def test_es_de_un_dia_de_cada_lado(self):
        desde, hasta = rango_de_carga(_dt("2026-09-10"), _dt("2026-09-12"))
        assert desde == date(2026, 9, 10) - timedelta(days=MARGEN_CARGA_DIAS)
        assert hasta == date(2026, 9, 12) + timedelta(days=MARGEN_CARGA_DIAS)

    def test_un_alquiler_de_un_solo_dia_no_degenera(self):
        """El rango nunca se invierte, ni siquiera con inicio y fin el mismo día."""
        desde, hasta = rango_de_carga(_dt("2026-09-10", "10:00"), _dt("2026-09-10", "18:00"))
        assert desde <= hasta


class TestNoCambiaLoQueSeDecide:
    """
    Acotar la búsqueda no puede cambiar el veredicto: lo que se trae de más lo
    descarta `detectar_solapamientos`, que es el único que decide.
    """

    def test_una_vecina_adyacente_se_trae_pero_no_bloquea(self):
        pedido_inicio, pedido_fin = _dt("2026-09-10"), _dt("2026-09-12")
        # Termina exactamente cuando la nueva empieza: adyacente, no solapa.
        vecina = VentanaReserva(
            id=1, vehiculo_id=7,
            inicio=_dt("2026-09-08"), fin=_dt("2026-09-10"),
            estado="confirmada", cliente_nombre="Vecina",
        )
        desde, hasta = rango_de_carga(pedido_inicio, pedido_fin)
        assert _entra_en_el_rango(vecina.inicio, vecina.fin, desde, hasta), (
            "se tiene que traer: por fecha está pegada"
        )

        resultado = detectar_solapamientos(7, pedido_inicio, pedido_fin, [vecina])
        assert not resultado.hay_conflicto_bloqueante, (
            "y no tiene que bloquear: adyacente no es solapado"
        )

    def test_una_reserva_vieja_del_mismo_auto_queda_afuera(self):
        """
        Lo que la optimización viene a evitar: la historia del vehículo. Una
        reserva de hace ocho meses no puede solapar y no hay por qué traerla.
        """
        pedido_inicio, pedido_fin = _dt("2026-09-10"), _dt("2026-09-12")
        desde, hasta = rango_de_carga(pedido_inicio, pedido_fin)
        vieja_inicio, vieja_fin = _dt("2026-01-05"), _dt("2026-01-09")
        assert not _entra_en_el_rango(vieja_inicio, vieja_fin, desde, hasta)
