"""
El listado de reservas filtra por varios estados a la vez.

Lo pidió el dueño con estas palabras: *"que pueda filtrar por 'esperando pago',
por 'confirmada' y las demás, que sean filtros esto y esto"*. En el mostrador la
pregunta nunca es "mostrame las confirmadas": es "mostrame lo que tengo que
resolver hoy", que son dos o tres estados juntos. Con un solo valor había que
mirar la pantalla tres veces y acordarse de lo de la vuelta anterior.

El `split(",")` ya existía en el repositorio, pero sin lista blanca: un estado
mal escrito devolvía **cero filas**, que en pantalla se lee igual que "no hay
reservas". Por eso el segundo test importa tanto como el primero — el filtro
tiene que romper fuerte, no callarse.
"""
from __future__ import annotations

import pytest

API = "/api/v1"


@pytest.fixture()
def reservas_de_todos_los_colores(hacer_reserva):
    """Una reserva por cada estado que el filtro tiene que saber distinguir."""
    return {
        estado: hacer_reserva(estado=estado)
        for estado in ("confirmada", "pendiente_pago", "cancelada", "finalizada")
    }


def _ids(respuesta) -> set[int]:
    return {r["id"] for r in respuesta.json()["data"]}


class TestVariosEstados:
    def test_dos_estados_traen_los_dos_y_nada_mas(self, client, reservas_de_todos_los_colores):
        r = reservas_de_todos_los_colores
        resp = client.get(f"{API}/reservas", params={"estado": "confirmada,pendiente_pago"})

        assert resp.status_code == 200
        assert _ids(resp) == {r["confirmada"].id, r["pendiente_pago"].id}
        # Lo importante no es sólo que estén las dos: es que la cancelada y la
        # finalizada NO estén. Un filtro que suma de más no acota nada.
        assert resp.json()["total"] == 2

    def test_un_solo_estado_sigue_funcionando(self, client, reservas_de_todos_los_colores):
        """
        Compatibilidad: el banner de vencidas y el de reservas web esperando la
        transferencia llaman con un estado pelado. Si eso se rompiera, los dos
        avisos de la pantalla se apagarían sin que nadie lo note.
        """
        resp = client.get(f"{API}/reservas", params={"estado": "pendiente_pago"})

        assert resp.status_code == 200
        assert _ids(resp) == {reservas_de_todos_los_colores["pendiente_pago"].id}

    def test_sin_estado_trae_todas(self, client, reservas_de_todos_los_colores):
        resp = client.get(f"{API}/reservas")

        assert resp.status_code == 200
        assert resp.json()["total"] == len(reservas_de_todos_los_colores)

    def test_los_espacios_no_rompen_nada(self, client, reservas_de_todos_los_colores):
        """`?estado=confirmada, cancelada` es lo que sale de copiar y pegar."""
        resp = client.get(f"{API}/reservas", params={"estado": " confirmada , cancelada "})

        assert resp.status_code == 200
        assert _ids(resp) == {
            reservas_de_todos_los_colores["confirmada"].id,
            reservas_de_todos_los_colores["cancelada"].id,
        }


class TestEstadoInvalido:
    @pytest.mark.parametrize("estado", ["confirmadas", "esperando_pago", "confirmada,inventado"])
    def test_devuelve_400_y_no_una_lista_vacia(self, client, reservas_de_todos_los_colores, estado):
        resp = client.get(f"{API}/reservas", params={"estado": estado})

        assert resp.status_code == 400
        # El mensaje nombra el estado que sobra: si dice sólo "estado inválido"
        # y se pidieron cuatro, hay que adivinar cuál era.
        assert "inválido" in str(resp.json()["detail"])

    def test_los_nueve_estados_del_enum_son_validos(self, client):
        """
        Ningún estado que exista de verdad puede dar 400. Es exactamente lo que
        pasó en `pagos.py` con `wapa`: la lista blanca escrita a mano se quedó
        corta y el filtro rechazaba un medio de pago que el sistema usaba.
        """
        from app.domain.enums import EstadoReserva

        for e in EstadoReserva:
            assert client.get(f"{API}/reservas", params={"estado": e.value}).status_code == 200
