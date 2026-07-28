"""
Tests del cálculo de adicionales de una reserva
(`ReservaService._subtotal_adicional`).

La lógica de congelado y sincronización vive en el service y necesita base,
pero la fórmula del subtotal es pura y es la que decide cuánta plata se
cobra — se testea acá, aislada.
"""
from decimal import Decimal

from app.services.reserva_service import ReservaService


sub = ReservaService._subtotal_adicional


class TestSubtotalAdicional:
    def test_por_dia_multiplica_por_la_duracion(self):
        assert sub(Decimal("12000"), "por_dia", 1, 5) == Decimal("60000")

    def test_unico_ignora_la_duracion(self):
        assert sub(Decimal("3000"), "unico", 1, 5) == Decimal("3000")

    def test_cantidad_multiplica_en_unico(self):
        assert sub(Decimal("3000"), "unico", 2, 5) == Decimal("6000")

    def test_cantidad_y_dias_se_combinan(self):
        assert sub(Decimal("12000"), "por_dia", 2, 3) == Decimal("72000")

    def test_extender_la_reserva_encarece_solo_lo_de_por_dia(self):
        """
        Si el auto se queda 10 días en vez de 5, el seguro cubre 10 y el
        portaequipaje se sigue cobrando una vez.
        """
        assert sub(Decimal("12000"), "por_dia", 1, 5) == Decimal("60000")
        assert sub(Decimal("12000"), "por_dia", 1, 10) == Decimal("120000")
        assert sub(Decimal("3000"), "unico", 1, 5) == sub(Decimal("3000"), "unico", 1, 10)

    def test_precio_congelado_manda_sobre_el_del_catalogo(self):
        """
        El subtotal se calcula con el precio que se le pasa, que es el
        congelado en la línea — no el vigente. Que el catálogo suba a 20.000
        no cambia una reserva pactada a 12.000.
        """
        assert sub(Decimal("12000"), "por_dia", 1, 5) == Decimal("60000")

    def test_precio_cero_no_suma(self):
        """La cobertura básica incluida existe pero no cobra."""
        assert sub(Decimal("0"), "por_dia", 1, 7) == Decimal("0")
