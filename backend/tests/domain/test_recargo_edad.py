"""
Tests del dominio: recargo por franja etaria (D-38).

Lo que se protege acá: que la edad se mida al retirar el auto, que un
solapamiento de franjas se resuelva siempre igual, y que el porcentaje no se
cobre dos veces por multiplicarlo por los días.
"""
from datetime import date
from decimal import Decimal

from app.domain.recargo_edad import (
    RecargoAplicado,
    RecargoEdadInfo,
    calcular_edad,
    calcular_recargo,
    seleccionar_recargo,
    vista_con_recargo_incluido,
)


def recargo(
    id: int, desde: int, hasta: int | None = None,
    monto: float | None = None, porcentaje: float | None = None,
    unidad: str = "por_dia", categoria_id: int | None = None,
) -> RecargoEdadInfo:
    return RecargoEdadInfo(
        id=id, nombre=f"Recargo {desde}-{hasta or '+'}",
        edad_desde=desde, edad_hasta=hasta,
        monto=Decimal(str(monto)) if monto is not None else None,
        porcentaje=Decimal(str(porcentaje)) if porcentaje is not None else None,
        unidad_cobro=unidad, categoria_id=categoria_id,
    )


class TestCalcularEdad:
    def test_cumple_antes_del_retiro(self):
        assert calcular_edad(date(2000, 3, 10), date(2026, 6, 1)) == 26

    def test_cumple_despues_del_retiro(self):
        assert calcular_edad(date(2000, 9, 10), date(2026, 6, 1)) == 25

    def test_cumple_justo_el_dia_del_retiro(self):
        """Cumplir años el día que retira ya cuenta: tiene la edad nueva."""
        assert calcular_edad(date(2001, 6, 1), date(2026, 6, 1)) == 25

    def test_el_dia_anterior_al_cumple_todavia_no(self):
        assert calcular_edad(date(2001, 6, 2), date(2026, 6, 1)) == 24

    def test_se_mide_al_retirar_no_hoy(self):
        """Quien cumple 25 antes de viajar ya no es conductor joven — cobrarle
        el recargo por la edad de hoy sería cobrarle de más."""
        nacimiento = date(2001, 5, 20)
        assert calcular_edad(nacimiento, date(2026, 5, 1)) == 24   # hoy
        assert calcular_edad(nacimiento, date(2026, 7, 1)) == 25   # al retirar


class TestSeleccionarRecargo:
    def test_dentro_de_la_franja(self):
        rs = [recargo(1, 18, 24, monto=5000)]
        assert seleccionar_recargo(20, rs).id == 1

    def test_los_bordes_son_inclusivos(self):
        rs = [recargo(1, 18, 24, monto=5000)]
        assert seleccionar_recargo(18, rs) is not None
        assert seleccionar_recargo(24, rs) is not None

    def test_fuera_de_la_franja_no_recarga(self):
        rs = [recargo(1, 18, 24, monto=5000)]
        assert seleccionar_recargo(25, rs) is None

    def test_sin_franjas_cargadas_no_recarga(self):
        assert seleccionar_recargo(20, []) is None

    def test_franja_sin_tope_superior(self):
        rs = [recargo(1, 75, None, monto=8000)]
        assert seleccionar_recargo(90, rs) is not None

    def test_la_de_categoria_le_gana_a_la_general(self):
        rs = [recargo(1, 18, 24, monto=5000), recargo(2, 18, 24, monto=12000, categoria_id=5)]
        assert seleccionar_recargo(20, rs, categoria_id=5).id == 2

    def test_la_de_otra_categoria_no_aplica(self):
        rs = [recargo(1, 18, 24, monto=12000, categoria_id=5)]
        assert seleccionar_recargo(20, rs, categoria_id=9) is None

    def test_solapamiento_gana_la_franja_mas_angosta(self):
        """Dos franjas que cubren la misma edad es un error de carga, pero
        resolverlo siempre igual es mejor que elegir al azar: al menos el mismo
        cliente paga siempre lo mismo."""
        rs = [recargo(1, 18, 30, monto=5000), recargo(2, 18, 21, monto=9000)]
        assert seleccionar_recargo(20, rs).id == 2


class TestCalcularRecargo:
    def test_sin_recargo_no_cobra_nada(self):
        assert calcular_recargo(None, 30, Decimal("300000"), 3) is None

    def test_monto_fijo_por_dia(self):
        r = recargo(1, 18, 24, monto=5000, unidad="por_dia")
        aplicado = calcular_recargo(r, 20, Decimal("300000"), 3)
        assert aplicado.monto == Decimal("15000.00")

    def test_monto_fijo_unico(self):
        r = recargo(1, 18, 24, monto=5000, unidad="unico")
        aplicado = calcular_recargo(r, 20, Decimal("300000"), 3)
        assert aplicado.monto == Decimal("5000.00")

    def test_porcentaje_sobre_el_subtotal_del_vehiculo(self):
        r = recargo(1, 18, 24, porcentaje=15)
        aplicado = calcular_recargo(r, 20, Decimal("300000"), 3)
        assert aplicado.monto == Decimal("45000.00")

    def test_el_porcentaje_no_se_multiplica_por_los_dias(self):
        """El subtotal ya es el total del auto por todo el alquiler: el
        porcentaje ya escala con la duración. Multiplicarlo otra vez lo
        cobraría al cuadrado."""
        r = recargo(1, 18, 24, porcentaje=10, unidad="por_dia")
        aplicado = calcular_recargo(r, 20, Decimal("300000"), 10)
        assert aplicado.monto == Decimal("30000.00")  # no 300.000

    def test_guarda_la_edad_con_la_que_se_cotizo(self):
        """Sin esto no se puede explicar el recargo meses después, cuando el
        conductor ya cumplió años."""
        r = recargo(1, 18, 24, monto=5000)
        assert calcular_recargo(r, 19, Decimal("100000"), 1).edad == 19

    def test_recargo_que_da_cero_no_se_aplica(self):
        r = recargo(1, 18, 24, porcentaje=0.001)
        assert calcular_recargo(r, 20, Decimal("100"), 1) is None


class TestVistaConRecargoIncluido:
    """
    El recargo entra en los tres números que muestra la tarjeta del paso 1, o
    no entra en ninguno. Mezclarlos deja un total que no se corresponde con el
    "por día" de al lado.
    """

    def aplicado(self, monto: str) -> RecargoAplicado:
        return RecargoAplicado(id=1, nombre="Franja joven", edad=20,
                               monto=Decimal(monto))

    def test_sin_recargo_no_toca_nada(self):
        promedio, referencia = vista_con_recargo_incluido(
            Decimal("100000"), Decimal("350000"), None, 3,
        )
        assert promedio == Decimal("100000")
        assert referencia == Decimal("350000")

    def test_el_promedio_por_dia_absorbe_el_prorrateo(self):
        promedio, _ = vista_con_recargo_incluido(
            Decimal("100000"), None, self.aplicado("30000"), 3,
        )
        assert promedio == Decimal("110000.00")

    def test_el_promedio_por_dia_reconstruye_el_total(self):
        """Es la cuenta que hace cualquier cliente: por día × días. Si no da
        el total mostrado, el precio parece inventado."""
        subtotal_vehiculo, dias, recargo = Decimal("300000"), 3, "45000"
        promedio, _ = vista_con_recargo_incluido(
            subtotal_vehiculo / dias, None, self.aplicado(recargo), dias,
        )
        assert promedio * dias == subtotal_vehiculo + Decimal(recargo)

    def test_la_referencia_sube_con_el_recargo(self):
        """Si sube el total y no la referencia, el tachado del "antes" puede
        quedar por debajo del precio vigente: una promo que muestra que te
        cobran más."""
        _, referencia = vista_con_recargo_incluido(
            Decimal("100000"), Decimal("330000"), self.aplicado("30000"), 3,
        )
        assert referencia == Decimal("360000.00")

    def test_referencia_nula_sigue_nula(self):
        _, referencia = vista_con_recargo_incluido(
            Decimal("100000"), None, self.aplicado("30000"), 3,
        )
        assert referencia is None

    def test_duracion_cero_no_divide_por_cero(self):
        promedio, _ = vista_con_recargo_incluido(
            Decimal("0"), None, self.aplicado("5000"), 0,
        )
        assert promedio == Decimal("5000.00")
