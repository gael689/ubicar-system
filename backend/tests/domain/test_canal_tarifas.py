"""
Canal en las tarifas por banda (migración 074, camino A).

Lo que estos tests fijan es la regla que hace **seguro** tener canal en el
fallback del motor: una tarifa de canal específico gana en su canal, pero si no
existe se cae a la compartida. Sin esa caída, olvidarse de cargar un canal
sería un "no se puede cotizar" — que es exactamente la falla que dejó al sitio
sin poder vender cuando la tabla quedó vacía.
"""
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.domain.enums import TipoTarifa
from app.domain.tarifas import TarifaInfo, cotizar_por_bandas, seleccionar_tarifa


def diaria(id: int, monto: str, canal: str = "ambos", *, vehiculo_id=None, categoria_id=None):
    return TarifaInfo(
        id=id,
        tipo=TipoTarifa.DIARIA,
        monto=Decimal(monto),
        vehiculo_id=vehiculo_id,
        categoria_id=categoria_id,
        canal=canal,
    )


class TestCaidaAlCompartido:
    def test_sin_tarifa_del_canal_usa_la_compartida(self):
        """El caso que evita el 'no se puede cotizar'."""
        tarifas = [diaria(1, "50000", "ambos", categoria_id=7)]
        cot = cotizar_por_bandas(3, tarifas, categoria_id=7, canal="web")
        assert cot.total == Decimal("150000.00")

    def test_la_del_canal_le_gana_a_la_compartida(self):
        tarifas = [
            diaria(1, "50000", "ambos", categoria_id=7),
            diaria(2, "60000", "web", categoria_id=7),
        ]
        web = cotizar_por_bandas(3, tarifas, categoria_id=7, canal="web")
        mostrador = cotizar_por_bandas(3, tarifas, categoria_id=7, canal="mostrador")
        assert web.total == Decimal("180000.00")
        # El mostrador no se entera de la tarifa web: sigue con la compartida.
        assert mostrador.total == Decimal("150000.00")

    def test_una_tarifa_de_otro_canal_no_sirve_de_fallback(self):
        """
        Sólo `ambos` es fallback. Una tarifa de `mostrador` **no** puede
        cotizar la web: si eso pasara, cargar un precio interno lo publicaría
        sin querer en el sitio.
        """
        tarifas = [diaria(1, "50000", "mostrador", categoria_id=7)]
        with pytest.raises(BusinessRuleError):
            cotizar_por_bandas(3, tarifas, categoria_id=7, canal="web")


class TestPrecedenciaConCanal:
    def test_el_alcance_manda_sobre_el_canal(self):
        """
        Vehículo > categoría > general sigue siendo la regla principal: el
        canal desempata **dentro** de un nivel, no lo saltea.

        Una tarifa de categoría con canal exacto no le gana a la del vehículo
        puntual, aunque la del vehículo sea sólo `ambos`.
        """
        tarifas = [
            diaria(1, "90000", "ambos", vehiculo_id=3),
            diaria(2, "40000", "web", categoria_id=7),
        ]
        cot = cotizar_por_bandas(2, tarifas, categoria_id=7, canal="web", vehiculo_id=3)
        assert cot.total == Decimal("180000.00")

    def test_a_igual_canal_gana_la_mas_reciente(self):
        tarifas = [
            diaria(1, "50000", "web", categoria_id=7),
            diaria(9, "70000", "web", categoria_id=7),
        ]
        cot = cotizar_por_bandas(1, tarifas, categoria_id=7, canal="web")
        assert cot.total == Decimal("70000.00")


class TestCompatibilidad:
    def test_sin_canal_todo_cotiza_igual_que_antes(self):
        """
        El default `ambos` es lo que permite que la migración no cambie ningún
        precio: sin pasar canal, el resultado es el de siempre.
        """
        tarifas = [diaria(1, "50000", categoria_id=7)]
        assert cotizar_por_bandas(4, tarifas, categoria_id=7).total == Decimal("200000.00")
        assert seleccionar_tarifa(4, tarifas, categoria_id=7).id == 1


class TestVehiculoPedido:
    def test_no_usa_la_tarifa_de_otro_vehiculo(self):
        """
        Antes `_elegir_de_tipo` tomaba cualquier tarifa con `vehiculo_id` no
        nulo, sin compararla con el vehículo pedido: si la lista venía sin
        pre-filtrar, se cotizaba con la tarifa de otro auto **en silencio**.
        """
        tarifas = [
            diaria(1, "999999", "ambos", vehiculo_id=99),   # otro auto
            diaria(2, "50000", "ambos", categoria_id=7),
        ]
        cot = cotizar_por_bandas(1, tarifas, categoria_id=7, canal="ambos", vehiculo_id=3)
        assert cot.total == Decimal("50000.00")
