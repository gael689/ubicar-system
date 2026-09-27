"""
El PDF de la reserva se lee como se escribe acá.

Revisando un PDF real (27/09/2026) aparecieron tres cosas que el cliente no
entendía: el total escrito `$ 20.00` (formato de Python: ¿veinte pesos o veinte
mil?), la forma de pago con el código crudo `mercado_pago`, y la etiqueta
"DNI / CUIT" que obliga a adivinar cuál de los dos es.
"""
from decimal import Decimal

from app.services.reserva_pdf import _FORMA_PAGO_LABEL, _documento, _money


class TestLosMontos:
    def test_miles_con_punto_y_sin_centavos_si_es_redondo(self):
        assert _money(Decimal("150000")) == "$ 150.000"
        assert _money(20) == "$ 20"

    def test_centavos_con_coma_cuando_existen(self):
        assert _money(Decimal("1234.5")) == "$ 1.234,50"

    def test_sin_monto_es_una_raya(self):
        assert _money(None) == "—"


class TestElDocumento:
    def test_dni_con_puntos(self):
        assert _documento("40123456") == "40.123.456"

    def test_cuit_con_guiones(self):
        assert _documento("20401234563") == "20-40123456-3"

    def test_el_marcador_de_pendiente_no_se_disfraza(self):
        assert _documento("A COMPLETAR") == "A COMPLETAR"


def test_ninguna_forma_de_pago_sale_con_el_codigo():
    for codigo in ("mercado_pago", "wapa", "transferencia", "efectivo", "echeq"):
        assert "_" not in _FORMA_PAGO_LABEL[codigo]
