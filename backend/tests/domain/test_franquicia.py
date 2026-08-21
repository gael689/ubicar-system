"""
La franquicia sale de la base de la categoría, no de un número guardado en la
cobertura.

`Adicional.franquicia` guardaba el resultado ya calculado, y eso sólo puede ser
cierto para una categoría. Hay seis, con tres bases distintas:

    Compacto y Sedán      $1.500.000
    Sedán superior        $2.000.000
    SUV, Pick-up, Furgón  $3.000.000

Con un absoluto compartido, el mismo "+10%" le bajaba $1.000.000 a un Compacto y
$2.500.000 a una SUV: el mismo precio comprando beneficios distintos. Y la
"Cobertura total" tenía guardado un **0**, que es una franquicia que no existe.

Son tres escalones **excluyentes** —el cliente elige uno— y lo que define cada
uno es cuánto descuenta:

    sin cobertura extra              la base entera
    reducida  (+10% del alquiler)    −$500.000
    total     (+30% del alquiler)    −$1.000.000
"""
from decimal import Decimal

import pytest

from app.domain.franquicia import (
    FRANQUICIA_MINIMA,
    franquicia_resultante,
    puede_bajar_hasta,
)

SIN_COBERTURA: list[Decimal] = []
REDUCIDA = [Decimal("500000")]
TOTAL = [Decimal("1000000")]


class TestLosTresEscalones:
    @pytest.mark.parametrize(
        "base, esperado_sin, esperado_reducida, esperado_total",
        [
            # Compacto y Sedán
            ("1500000", "1500000", "1000000", "500000"),
            # Sedán superior
            ("2000000", "2000000", "1500000", "1000000"),
            # SUV, Pick-up y Furgón
            ("3000000", "3000000", "2500000", "2000000"),
        ],
    )
    def test_cada_categoria_tiene_su_propia_escalera(
        self, base, esperado_sin, esperado_reducida, esperado_total
    ):
        b = Decimal(base)
        assert franquicia_resultante(b, SIN_COBERTURA) == Decimal(esperado_sin)
        assert franquicia_resultante(b, REDUCIDA) == Decimal(esperado_reducida)
        assert franquicia_resultante(b, TOTAL) == Decimal(esperado_total)

    def test_el_mismo_descuento_da_numeros_distintos_segun_la_categoria(self):
        """
        Es el bug que esto viene a arreglar: antes el número era uno solo y se
        mostraba igual para todos los autos.
        """
        compacto = franquicia_resultante(Decimal("1500000"), REDUCIDA)
        suv = franquicia_resultante(Decimal("3000000"), REDUCIDA)
        assert compacto == Decimal("1000000")
        assert suv == Decimal("2500000")
        assert compacto != suv


class TestNoExisteLaFranquiciaCero:
    def test_nunca_baja_del_minimo(self):
        """
        Una cobertura que deja al cliente sin ninguna responsabilidad cambia el
        incentivo de cuidar el auto, y no es lo que se vende.
        """
        assert franquicia_resultante(Decimal("1000000"), TOTAL) == FRANQUICIA_MINIMA

    def test_ni_con_un_descuento_absurdo(self):
        assert franquicia_resultante(Decimal("1500000"), [Decimal("99000000")]) == FRANQUICIA_MINIMA

    def test_puede_bajar_hasta_delata_el_dato_mal_cargado(self):
        """
        El piso tapa el error: el número que ve el cliente se sigue viendo bien
        y la tabla está mal. Esto es lo que permite avisarlo en la pantalla de
        carga.
        """
        assert puede_bajar_hasta(Decimal("1000000"), TOTAL) == Decimal("0")
        assert puede_bajar_hasta(Decimal("800000"), TOTAL) == Decimal("-200000")
        # Y con datos sanos, coincide con el resultado.
        assert puede_bajar_hasta(Decimal("1500000"), TOTAL) == Decimal("500000")


class TestSonEscalonesNoSeSuman:
    def test_dos_coberturas_a_la_vez_no_acumulan_descuentos(self):
        """
        El paso 2 del flujo web dice "Elegí una" y borra las demás al elegir.
        Si un dato mal cargado dejara dos, la respuesta prudente es la
        franquicia **más alta** de las dos posibles: no se le promete de más al
        cliente.
        """
        base = Decimal("1500000")
        assert franquicia_resultante(base, [Decimal("500000"), Decimal("1000000")]) == Decimal("500000")
        # Y no $0, que es lo que daría sumar los dos descuentos.
        assert franquicia_resultante(base, [Decimal("500000"), Decimal("1000000")]) != Decimal("0")


class TestSinBaseCargada:
    def test_devuelve_none_y_no_cero(self):
        """
        D-53: sin base cargada el contrato no imprime franquicia. Un cero sería
        una afirmación, y se lee como "no pagás nada" — lo contrario de lo que
        significa.
        """
        assert franquicia_resultante(None, TOTAL) is None
        assert franquicia_resultante(None, SIN_COBERTURA) is None
        assert puede_bajar_hasta(None, TOTAL) is None
