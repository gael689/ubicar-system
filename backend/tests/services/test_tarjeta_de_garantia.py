"""
El número completo de la tarjeta de garantía no entra a la base (migración 078).

`reservas.garantia_tarjeta_numero` guardaba el número entero, en texto plano.
El sistema no está lanzado, así que la solución no es encriptar sino **dejar de
guardarlo**: quedan los últimos cuatro, que es lo único que sirve para
reconocer la tarjeta frente al cliente.

`_ultimos_cuatro` es la última línea de defensa: el formulario ya manda cuatro,
pero un POST directo entraría igual, y esta función está en el único punto por
el que pasan todas las altas de reserva.
"""
import pytest

from app.models.reserva import Reserva
from app.services.reserva_service import _ultimos_cuatro


class TestUltimosCuatro:
    @pytest.mark.parametrize(
        "entrada, esperado",
        [
            ("4509953566233704", "3704"),
            ("4509 9535 6623 3704", "3704"),
            ("4509-9535-6623-3704", "3704"),
            ("3704", "3704"),
            ("**** **** **** 3704", "3704"),
            ("", None),
            (None, None),
            ("   ", None),
        ],
    )
    def test_se_queda_con_cuatro_digitos_y_nada_mas(self, entrada, esperado):
        assert _ultimos_cuatro(entrada) == esperado

    def test_un_numero_completo_no_sobrevive(self):
        """El caso que importa: si alguien lo manda entero, se descarta."""
        completo = "4509953566233704"
        guardado = _ultimos_cuatro(completo)
        assert guardado is not None
        assert len(guardado) == 4
        assert completo not in guardado


class TestElModeloYaNoTieneLaColumna:
    def test_no_existe_garantia_tarjeta_numero(self):
        columnas = set(Reserva.__table__.columns.keys())
        assert "garantia_tarjeta_numero" not in columnas
        assert "garantia_tarjeta_ultimos4" in columnas

    def test_la_columna_no_deja_entrar_mas_de_cuatro(self):
        assert Reserva.__table__.columns["garantia_tarjeta_ultimos4"].type.length == 4
