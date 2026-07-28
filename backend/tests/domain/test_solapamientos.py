"""
Tests del dominio: solapamientos.
Cobertura: total, parcial, exacto en bordes, sin solapamiento, adyacentes, filtro por estado.
"""
from datetime import datetime

import pytest

from app.domain.solapamientos import hay_solapamiento, detectar_solapamientos
from app.domain.ventana import VentanaReserva


# ─── Helpers ──────────────────────────────────────────────────────────────────

def dt(dia: int, hora: int = 0) -> datetime:
    """Shorthand: datetime en mayo 2026."""
    return datetime(2026, 5, dia, hora, 0, 0)


def ventana(id: int, inicio_dia: int, fin_dia: int, estado: str = "confirmada") -> VentanaReserva:
    return VentanaReserva(
        id=id,
        vehiculo_id=1,
        inicio=dt(inicio_dia),
        fin=dt(fin_dia),
        estado=estado,
    )


# ─── Tests de hay_solapamiento ────────────────────────────────────────────────

class TestHaySolapamiento:
    def test_solapamiento_total(self):
        """A engloba completamente a B."""
        assert hay_solapamiento(dt(1), dt(10), dt(3), dt(7)) is True

    def test_solapamiento_parcial_inicio(self):
        """A comienza antes y termina dentro de B."""
        assert hay_solapamiento(dt(1), dt(5), dt(3), dt(8)) is True

    def test_solapamiento_parcial_fin(self):
        """A comienza dentro de B y termina después."""
        assert hay_solapamiento(dt(3), dt(8), dt(1), dt(5)) is True

    def test_sin_solapamiento_antes(self):
        """A termina antes de que B empiece."""
        assert hay_solapamiento(dt(1), dt(3), dt(5), dt(8)) is False

    def test_sin_solapamiento_despues(self):
        """A empieza después de que B termina."""
        assert hay_solapamiento(dt(6), dt(9), dt(1), dt(5)) is False

    def test_adyacentes_no_solapan(self):
        """fin_a == inicio_b → NO deben solapar (punto de contacto exacto)."""
        assert hay_solapamiento(dt(1), dt(5), dt(5), dt(8)) is False

    def test_adyacentes_inverso_no_solapan(self):
        """fin_b == inicio_a → NO deben solapar."""
        assert hay_solapamiento(dt(5), dt(8), dt(1), dt(5)) is False

    def test_exactamente_identicos(self):
        """Mismo rango exacto → solapa."""
        assert hay_solapamiento(dt(1), dt(5), dt(1), dt(5)) is True

    def test_a_contiene_b_exactamente(self):
        """B está dentro de A con los mismos límites → solapa."""
        assert hay_solapamiento(dt(1), dt(10), dt(1), dt(10)) is True


# ─── Tests de detectar_solapamientos ─────────────────────────────────────────

class TestDetectarSolapamientos:
    def test_sin_ventanas_no_conflicto(self):
        res = detectar_solapamientos(1, dt(10), dt(12), [])
        assert res.hay_conflicto_bloqueante is False
        assert res.hay_advertencia is False

    def test_confirmada_solapando_es_bloqueante(self):
        ventanas = [ventana(1, 8, 14, estado="confirmada")]
        res = detectar_solapamientos(1, dt(10), dt(16), ventanas)
        assert res.hay_conflicto_bloqueante is True
        assert len(res.conflictos_bloqueantes) == 1

    def test_activa_solapando_es_bloqueante(self):
        ventanas = [ventana(1, 8, 14, estado="activa")]
        res = detectar_solapamientos(1, dt(10), dt(16), ventanas)
        assert res.hay_conflicto_bloqueante is True

    def test_pendiente_solapando_es_advertencia(self):
        ventanas = [ventana(1, 8, 14, estado="pendiente")]
        res = detectar_solapamientos(1, dt(10), dt(16), ventanas)
        assert res.hay_conflicto_bloqueante is False
        assert res.hay_advertencia is True
        assert len(res.conflictos_advertencia) == 1

    def test_cancelada_no_genera_conflicto(self):
        ventanas = [ventana(1, 8, 14, estado="cancelada")]
        res = detectar_solapamientos(1, dt(10), dt(16), ventanas)
        assert res.hay_conflicto_bloqueante is False
        assert res.hay_advertencia is False

    def test_finalizada_no_genera_conflicto(self):
        ventanas = [ventana(1, 8, 14, estado="finalizada")]
        res = detectar_solapamientos(1, dt(10), dt(16), ventanas)
        assert res.hay_conflicto_bloqueante is False

    def test_otro_vehiculo_no_genera_conflicto(self):
        otra = VentanaReserva(id=99, vehiculo_id=2, inicio=dt(10), fin=dt(14), estado="confirmada")
        res = detectar_solapamientos(1, dt(10), dt(16), [otra])
        assert res.hay_conflicto_bloqueante is False

    def test_excluir_id_no_genera_conflicto_con_si_mismo(self):
        """Al editar una reserva no debe conflictuar con ella misma."""
        ventanas = [ventana(42, 10, 14, estado="confirmada")]
        res = detectar_solapamientos(1, dt(10), dt(14), ventanas, excluir_id=42)
        assert res.hay_conflicto_bloqueante is False

    def test_adyacentes_no_conflictuan(self):
        """Una reserva que termina justo donde empieza la nueva → no conflicto."""
        ventanas = [ventana(1, 5, 10, estado="confirmada")]
        res = detectar_solapamientos(1, dt(10), dt(14), ventanas)
        assert res.hay_conflicto_bloqueante is False

    def test_mezcla_bloqueante_y_advertencia(self):
        """Confirmada + pendiente solapando → bloqueante Y advertencia."""
        ventanas = [
            ventana(1, 8, 14, estado="confirmada"),
            ventana(2, 11, 16, estado="pendiente"),
        ]
        res = detectar_solapamientos(1, dt(10), dt(15), ventanas)
        assert res.hay_conflicto_bloqueante is True
        assert res.hay_advertencia is True


# ─── Bloqueos de vehículo (Fase 5, ítem 59) ──────────────────────────────────

class TestBloqueosVehiculo:
    """
    Un bloqueo entra como una ventana más con estado "bloqueo". La gracia es
    que no hay lógica nueva: rechaza reservas por el mismo camino que una
    reserva confirmada.
    """

    def _bloqueo(self, inicio, fin, vehiculo_id=1, id=99):
        return VentanaReserva(
            id=id, vehiculo_id=vehiculo_id, inicio=inicio, fin=fin,
            estado="bloqueo", cliente_nombre="En mantenimiento", tipo="bloqueo",
        )

    def test_bloqueo_es_bloqueante(self):
        r = detectar_solapamientos(
            1, datetime(2026, 6, 10), datetime(2026, 6, 15),
            [self._bloqueo(datetime(2026, 6, 12), datetime(2026, 6, 14))],
        )
        assert r.hay_conflicto_bloqueante
        assert r.conflictos_bloqueantes[0].tipo == "bloqueo"

    def test_bloqueo_de_otro_vehiculo_no_molesta(self):
        r = detectar_solapamientos(
            1, datetime(2026, 6, 10), datetime(2026, 6, 15),
            [self._bloqueo(datetime(2026, 6, 12), datetime(2026, 6, 14), vehiculo_id=2)],
        )
        assert not r.hay_conflicto_bloqueante

    def test_reserva_antes_del_bloqueo_pasa(self):
        r = detectar_solapamientos(
            1, datetime(2026, 6, 1), datetime(2026, 6, 5),
            [self._bloqueo(datetime(2026, 6, 12), datetime(2026, 6, 14))],
        )
        assert not r.hay_conflicto_bloqueante

    def test_bloqueo_adyacente_no_solapa(self):
        """El auto sale del taller el 12 a las 00:00 y se entrega ese mismo momento."""
        r = detectar_solapamientos(
            1, datetime(2026, 6, 12), datetime(2026, 6, 15),
            [self._bloqueo(datetime(2026, 6, 10), datetime(2026, 6, 12))],
        )
        assert not r.hay_conflicto_bloqueante

    def test_bloqueo_de_un_solo_dia_bloquea_ese_dia(self):
        """
        Un bloqueo del 12 al 12 se carga como [12 00:00, 13 00:00): tiene que
        rechazar una reserva que empieza el 12. Si la ventana terminara el
        mismo 12 a las 00:00 duraría cero y no bloquearía nada.
        """
        r = detectar_solapamientos(
            1, datetime(2026, 6, 12, 10, 0), datetime(2026, 6, 14),
            [self._bloqueo(datetime(2026, 6, 12), datetime(2026, 6, 13))],
        )
        assert r.hay_conflicto_bloqueante

    def test_bloqueo_convive_con_reservas(self):
        ventanas = [
            self._bloqueo(datetime(2026, 6, 12), datetime(2026, 6, 14)),
            VentanaReserva(id=1, vehiculo_id=1, inicio=datetime(2026, 6, 20),
                           fin=datetime(2026, 6, 25), estado="pendiente"),
        ]
        r = detectar_solapamientos(1, datetime(2026, 6, 13), datetime(2026, 6, 22), ventanas)
        assert r.hay_conflicto_bloqueante
        assert r.hay_advertencia
