"""
Tests del cálculo de adicionales de una reserva
(`ReservaService._subtotal_adicional`).

La lógica de congelado y sincronización vive en el service y necesita base,
pero la fórmula del subtotal es pura y es la que decide cuánta plata se
cobra — se testea acá, aislada.
"""
from decimal import Decimal
from types import SimpleNamespace

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


class TestPrecioUnitarioPorPorcentaje:
    """
    Las coberturas no tienen precio propio: cuestan un porcentaje del
    alquiler. Su `precio` es 0 en el catálogo, y hasta ahora **ese 0 era lo
    que se congelaba en la reserva**: el cliente pagaba la cobertura en la
    pasarela y en el sistema esa plata no existía como concepto.
    """

    @staticmethod
    def _adicional(precio="0", pct=None):
        return SimpleNamespace(
            precio=Decimal(str(precio)),
            porcentaje_sobre_alquiler=None if pct is None else Decimal(str(pct)),
        )

    @staticmethod
    def _reserva(precio_total="400000"):
        return SimpleNamespace(precio_total=Decimal(str(precio_total)))

    def test_una_cobertura_por_porcentaje_ya_no_se_congela_en_cero(self):
        unitario = ReservaService._precio_unitario_adicional(
            self._adicional(precio="0", pct=30), self._reserva("400000"),
        )
        assert unitario == Decimal("120000.00")

    def test_un_extra_con_precio_fijo_no_cambia(self):
        unitario = ReservaService._precio_unitario_adicional(
            self._adicional(precio="4500"), self._reserva("400000"),
        )
        assert unitario == Decimal("4500")

    def test_el_porcentaje_se_calcula_sobre_el_alquiler_de_esa_reserva(self):
        """No es un monto fijo: el mismo 20% da distinto según el alquiler."""
        a = self._adicional(pct=20)
        assert ReservaService._precio_unitario_adicional(a, self._reserva("400000")) == Decimal("80000.00")
        assert ReservaService._precio_unitario_adicional(a, self._reserva("1000000")) == Decimal("200000.00")

    def test_sin_precio_total_todavia_no_explota(self):
        """Una reserva a medio armar no tiene que romper el cálculo."""
        unitario = ReservaService._precio_unitario_adicional(
            self._adicional(pct=45), SimpleNamespace(precio_total=None),
        )
        assert unitario == Decimal("0.00")

    def test_los_porcentajes_no_se_acumulan_entre_niveles(self):
        """Las coberturas son excluyentes: +45% es sobre el alquiler original,
        nunca +20% y después +45% sobre ese resultado."""
        reserva = self._reserva("400000")
        top = ReservaService._precio_unitario_adicional(self._adicional(pct=20), reserva)
        super_top = ReservaService._precio_unitario_adicional(self._adicional(pct=45), reserva)
        assert Decimal("400000") + top == Decimal("480000.00")
        assert Decimal("400000") + super_top == Decimal("580000.00")
        # Lo que NO tiene que pasar: 400000 * 1.20 * 1.45 = 696000
        assert Decimal("400000") + super_top != Decimal("696000.00")

    def test_un_porcentaje_no_se_multiplica_por_los_dias(self):
        """
        Las coberturas están cargadas con `unidad_cobro = 'por_dia'`, pero el
        porcentaje ya se calculó sobre el alquiler **entero**. Multiplicarlo
        otra vez cobraría 30% por día — 120% en un alquiler de cuatro días.

        Es la excepción que el cotizador ya hace (`domain/precios.py`), y los
        dos tienen que coincidir: uno es lo que se le cobra al cliente, el
        otro lo que queda registrado en la reserva.
        """
        assert sub(Decimal("120000"), "por_dia", 1, 4, es_porcentaje=True) == Decimal("120000")
        # Un extra por día sí multiplica, como siempre.
        assert sub(Decimal("4500"), "por_dia", 1, 4) == Decimal("18000")
