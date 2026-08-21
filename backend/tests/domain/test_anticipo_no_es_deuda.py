"""
Un anticipo no es una deuda a favor del cliente.

**El bug que esto fija.** El libro mide *cuánto nos debe el cliente* (D-01:
saldo positivo = debe). El débito de un alquiler se crea en el **check-out**,
pero la plata puede entrar mucho antes: una reserva web pagada con tarjeta
acredita en el instante en que Mercado Pago confirma, y con la ventana
comercial vigente el auto puede retirarse hasta 120 días después.

En todo ese tiempo hay un crédito sin su débito. El saldo queda negativo y la
ficha del cliente decía, en verde, **"El cliente tiene saldo a favor"** — de
alguien que no tiene nada a favor: nos pagó y todavía no le dimos el auto.

No es un error de cuentas. Plata cobrada por algo no entregado es un anticipo,
y un anticipo es una obligación real. El error es contarlo junto con la deuda,
que es un hecho distinto. Lo que fijan estos tests es la separación:

    saldo   = lo de siempre, sin tocar (débitos − créditos)
    deuda   = lo que el cliente debe de verdad = saldo + anticipos
    anticipos = créditos de reservas que todavía no salieron
"""
from decimal import Decimal

import pytest

from app.domain.cuenta_corriente import aplicar_movimiento, signo_movimiento


def desglosar(saldo: Decimal, anticipos: Decimal) -> dict:
    """
    La misma aritmética que `CuentaCorrienteService.desglose`.

    ⚠️ **Esto sigue siendo una réplica, y ahora está declarado.** Los tests de
    abajo prueban **la regla** —cómo se combinan saldo y anticipos— y no el
    service, así que replicarla acá era razonable, pero el archivo no lo decía y
    se leía como red donde no la había: la consulta podía estar mal y estos
    tests seguían en verde.

    **La red de verdad la pone `tests/services/test_la_sena_tiene_un_solo_camino.py`**,
    que importa el service, escribe en la base y verifica de qué se compone
    `anticipos`. Estos tests cubren la otra mitad: que la aritmética sea la
    correcta aunque la consulta la alimente bien.
    """
    return {"saldo": saldo, "deuda": saldo + anticipos, "anticipos": anticipos}


class TestLaConvencionDeSignos:
    """Lo primero, porque es contraintuitivo y es de donde salió la confusión."""

    def test_debito_suma_credito_resta(self):
        assert signo_movimiento("debito") == 1
        assert signo_movimiento("credito") == -1

    def test_saldo_positivo_es_el_cliente_debe(self):
        saldo = aplicar_movimiento(Decimal("0"), "debito", Decimal("425000"))
        assert saldo == Decimal("425000")

    def test_saldo_negativo_es_a_favor_del_cliente(self):
        """
        No es "el cliente nos debe". El libro está escrito desde la empresa y
        mide cuánto nos debe él: una deuda negativa es crédito suyo.
        """
        saldo = aplicar_movimiento(Decimal("0"), "credito", Decimal("425000"))
        assert saldo == Decimal("-425000")


class TestElCasoQueMotivaTodo:
    """La reserva web pagada con tarjeta, antes de que el auto salga."""

    def test_pagada_por_adelantado_no_es_saldo_a_favor(self):
        # Paga los $425.000 completos con tarjeta. El débito todavía no existe.
        saldo = aplicar_movimiento(Decimal("0"), "credito", Decimal("425000"))
        assert saldo == Decimal("-425000"), "el saldo crudo queda negativo"

        d = desglosar(saldo, anticipos=Decimal("425000"))

        # Lo que la pantalla muestra grande: no debe nada, y no tiene nada a favor.
        assert d["deuda"] == Decimal("0")
        # Y lo que sí hay: un auto por entregar.
        assert d["anticipos"] == Decimal("425000")
        # El saldo de siempre no se toca: esto sólo lee y explica.
        assert d["saldo"] == Decimal("-425000")

    def test_al_salir_el_auto_se_cancela_solo(self):
        # Check-out: se crea el débito del alquiler.
        saldo = aplicar_movimiento(Decimal("-425000"), "debito", Decimal("425000"))
        assert saldo == Decimal("0")
        # Ya no hay anticipo: el check-out lo marcó aplicado contra ese débito.
        d = desglosar(saldo, anticipos=Decimal("0"))
        assert d["deuda"] == Decimal("0")
        assert d["anticipos"] == Decimal("0")

    def test_una_sena_parcial_deja_deuda_y_anticipo(self):
        """El caso mixto: pagó una parte online y el resto queda para el mostrador."""
        saldo = aplicar_movimiento(Decimal("0"), "credito", Decimal("150000"))
        d = desglosar(saldo, anticipos=Decimal("150000"))
        assert d["anticipos"] == Decimal("150000")
        # Todavía no se le facturó nada, así que no debe nada.
        assert d["deuda"] == Decimal("0")


class TestNoSeTapaUnaDeudaDeVerdad:
    """
    Lo que no puede pasar: que el desglose esconda una deuda real detrás de un
    anticipo. Son independientes y tienen que poder convivir.
    """

    def test_deuda_vieja_y_anticipo_nuevo_conviven(self):
        # Un alquiler viejo sin pagar.
        saldo = aplicar_movimiento(Decimal("0"), "debito", Decimal("300000"))
        # Y una reserva nueva, pagada por adelantado.
        saldo = aplicar_movimiento(saldo, "credito", Decimal("425000"))
        assert saldo == Decimal("-125000"), (
            "el saldo crudo se ve a favor y tapa los $300.000 que debe"
        )

        d = desglosar(saldo, anticipos=Decimal("425000"))
        assert d["deuda"] == Decimal("300000"), "la deuda vieja sigue a la vista"
        assert d["anticipos"] == Decimal("425000")

    def test_sin_anticipos_el_desglose_es_el_saldo(self):
        """Sin reservas pagadas por adelantado, nada cambia respecto de antes."""
        saldo = aplicar_movimiento(Decimal("0"), "debito", Decimal("300000"))
        d = desglosar(saldo, anticipos=Decimal("0"))
        assert d["deuda"] == d["saldo"] == Decimal("300000")

    def test_un_pago_normal_sigue_siendo_credito_y_no_anticipo(self):
        """
        Pagar un alquiler ya entregado reduce la deuda y **no** es un anticipo:
        nace con naturaleza `pago`, no `anticipo`, así que su crédito no entra
        en la cuenta.
        """
        saldo = aplicar_movimiento(Decimal("300000"), "credito", Decimal("300000"))
        d = desglosar(saldo, anticipos=Decimal("0"))
        assert d["deuda"] == Decimal("0")
        assert d["anticipos"] == Decimal("0")
