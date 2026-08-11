"""
Tests del dominio: cobro online (D-30 y las cuatro reglas de
docs/PLAN_RESERVAS_WEB.md §6).

Son los caminos que la API real casi nunca produce a pedido —un webhook
duplicado, un pago que se aprueba tarde, un monto que no coincide— y los que
más caro salen si están mal. Corren sin cuenta de Mercado Pago y sin base.
"""
import pytest
from decimal import Decimal

from app.domain.pagos_web import (
    APROBADO,
    PORCENTAJES_ANTICIPO,
    calcular_anticipo,
    estado_pago_reserva,
    monto_coincide,
    referencia_externa,
    reserva_de_referencia,
    resolver,
    validar_porcentaje,
    ya_procesado,
)


class TestValidarPorcentaje:
    def test_acepta_los_tres_definidos(self):
        for p in PORCENTAJES_ANTICIPO:
            validar_porcentaje(p)

    def test_rechaza_por_debajo_del_piso(self):
        # D-30: el piso es 30%. Es un endpoint público, cualquiera puede
        # mandar un 1 en el body.
        with pytest.raises(ValueError):
            validar_porcentaje(10)

    def test_rechaza_un_valor_intermedio_no_ofrecido(self):
        with pytest.raises(ValueError):
            validar_porcentaje(40)

    def test_rechaza_mas_del_cien(self):
        with pytest.raises(ValueError):
            validar_porcentaje(120)


class TestCalcularAnticipo:
    def test_treinta_por_ciento_sin_descuento(self):
        a = calcular_anticipo(Decimal("100000"), 30)
        assert a.monto_a_cobrar == Decimal("30000.00")
        assert a.saldo == Decimal("70000.00")
        assert a.descuento == Decimal("0.00")

    def test_cincuenta_por_ciento(self):
        a = calcular_anticipo(Decimal("100000"), 50)
        assert a.monto_a_cobrar == Decimal("50000.00")
        assert a.saldo == Decimal("50000.00")

    def test_cien_por_ciento_no_deja_saldo(self):
        a = calcular_anticipo(Decimal("100000"), 100)
        assert a.monto_a_cobrar == Decimal("100000.00")
        assert a.saldo == Decimal("0.00")
        assert a.paga_todo

    def test_descuento_solo_aplica_al_pago_total(self):
        # D-30: se resigna margen a cambio de eliminar la cobranza en el
        # mostrador. Una seña parcial no elimina nada, así que no lo lleva.
        parcial = calcular_anticipo(Decimal("100000"), 30, Decimal("10"))
        assert parcial.descuento == Decimal("0.00")
        assert parcial.monto_a_cobrar == Decimal("30000.00")

        total = calcular_anticipo(Decimal("100000"), 100, Decimal("10"))
        assert total.descuento == Decimal("10000.00")
        assert total.monto_a_cobrar == Decimal("90000.00")
        assert total.total_final == Decimal("90000.00")

    def test_el_total_de_lista_se_conserva_para_auditar(self):
        a = calcular_anticipo(Decimal("100000"), 100, Decimal("10"))
        assert a.total_lista == Decimal("100000.00")

    def test_redondea_a_dos_decimales(self):
        a = calcular_anticipo(Decimal("99999.99"), 30)
        assert a.monto_a_cobrar == Decimal("30000.00")
        # Anticipo + saldo tiene que dar el total: si no, se pierde un centavo
        # en cada reserva y la cuenta corriente nunca cierra.
        assert a.monto_a_cobrar + a.saldo == a.total_final

    def test_total_cero_es_un_error(self):
        with pytest.raises(ValueError):
            calcular_anticipo(Decimal("0"), 30)


class TestEstadoPagoReserva:
    def test_pago_total_queda_pagado(self):
        assert estado_pago_reserva(100) == "pagado"

    def test_sena_queda_como_anticipo(self):
        # El saldo se cobra al check-out por el camino que ya existe.
        assert estado_pago_reserva(30) == "anticipo"
        assert estado_pago_reserva(50) == "anticipo"


class TestResolver:
    def test_aprobado_con_cupo_confirma_y_acredita(self):
        r = resolver("approved", hay_cupo=True)
        assert r.estado_reserva == "confirmada"
        assert r.acreditar
        assert not r.requiere_persona
        assert not r.liberar_hold

    def test_aprobado_sin_cupo_acredita_igual_y_llama_a_una_persona(self):
        # Decisión #4. La plata entró: el asiento va igual. Lo que no se hace
        # es confirmar una reserva que no tiene auto.
        r = resolver("approved", hay_cupo=False)
        assert r.estado_reserva == "revision_sin_cupo"
        assert r.acreditar
        assert r.requiere_persona
        assert r.liberar_hold

    @pytest.mark.parametrize("estado", ["pending", "in_process", "authorized"])
    def test_pendiente_no_acredita_ni_libera(self, estado):
        # El cupo se sigue sosteniendo: el pago todavía puede entrar.
        r = resolver(estado, hay_cupo=True)
        assert r.estado_reserva == "pendiente_pago"
        assert not r.acreditar
        assert not r.liberar_hold

    @pytest.mark.parametrize("estado", ["rejected", "cancelled"])
    def test_rechazado_cancela_y_libera_el_cupo(self, estado):
        r = resolver(estado, hay_cupo=True)
        assert r.estado_reserva == "cancelada"
        assert not r.acreditar
        assert r.liberar_hold

    @pytest.mark.parametrize("estado", ["refunded", "charged_back"])
    def test_devolucion_no_se_revierte_sola(self, estado):
        r = resolver(estado, hay_cupo=True)
        assert r.requiere_persona
        assert not r.acreditar

    def test_estado_desconocido_no_confirma_nada(self):
        r = resolver("una_novedad_de_mercado_pago", hay_cupo=True)
        assert not r.acreditar
        assert r.requiere_persona
        assert r.estado_reserva == "pendiente_pago"


class TestIdempotencia:
    """Regla 2 de §6: Mercado Pago reintenta. Es normal, no es una falla."""

    def test_la_primera_vez_se_procesa(self):
        assert not ya_procesado(None, APROBADO)

    def test_el_mismo_estado_repetido_no_se_reprocesa(self):
        # Sin esto, un pago genera dos asientos en la cuenta corriente.
        assert ya_procesado(APROBADO, APROBADO)

    def test_un_pendiente_tardio_no_desconfirma_un_aprobado(self):
        # Los webhooks pueden llegar desordenados.
        assert ya_procesado(APROBADO, "pending")

    def test_un_aprobado_posterior_a_un_pendiente_si_se_procesa(self):
        assert not ya_procesado("pending", APROBADO)

    def test_una_devolucion_posterior_se_procesa(self):
        assert not ya_procesado(APROBADO, "refunded")


class TestMontoCoincide:
    """Regla 4: nunca confiar en el monto que vuelve del navegador."""

    def test_iguales_al_centavo(self):
        assert monto_coincide(Decimal("30000.00"), Decimal("30000"))

    def test_un_centavo_de_menos_no_pasa(self):
        assert not monto_coincide(Decimal("30000.00"), Decimal("29999.99"))

    def test_pagar_de_menos_no_pasa(self):
        assert not monto_coincide(Decimal("30000"), Decimal("1"))


class TestReferenciaExterna:
    def test_ida_y_vuelta(self):
        assert reserva_de_referencia(referencia_externa(42)) == 42

    def test_referencia_ajena_se_ignora(self):
        # Una notificación de otra integración en la misma cuenta.
        assert reserva_de_referencia("pedido-9") is None

    def test_referencia_vacia(self):
        assert reserva_de_referencia(None) is None

    def test_referencia_corrupta_no_explota(self):
        assert reserva_de_referencia("ubicar-reserva-ocho") is None


class TestMotivoDelDescuentoWeb:
    """
    El motivo que se guarda en la reserva cuando la web cobra menos que el
    precio de lista.

    **Sin motivo, `ReservaService.create` rechaza la reserva entera** —y hace
    bien: un precio por debajo del de lista sin explicación es un descuento que
    nadie autorizó. Acá se dejaba constancia sólo del D-30 (la palanca de
    `configuracion`, hoy en 0) y no del descuento por duración, que en la web
    también se gana pagando el 100%. Consecuencia: **toda reserva web al 100%
    de 3 días o más moría en un 409 antes de llegar a la pasarela**, o sea
    justo la opción que la web empuja. Con seña parcial no pasaba, porque ahí
    no hay descuento y no hay nada que explicar.
    """

    class _Cot:
        def __init__(self, monto="0", nombre=None, porcentaje="0"):
            self.descuento_monto = Decimal(monto)
            self.descuento_nombre = nombre
            self.descuento_porcentaje = Decimal(porcentaje)

    def _motivo(self, cot, pct=100, d30="0"):
        from app.services.pago_web_service import _motivo_descuento

        return _motivo_descuento(cot, pct, Decimal(d30))

    def test_sena_parcial_no_necesita_motivo(self):
        assert self._motivo(self._Cot(), pct=30) is None

    def test_el_descuento_por_duracion_deja_constancia(self):
        motivo = self._motivo(self._Cot("97500", "7 a 15 días", "15"))
        assert motivo is not None
        assert "7 a 15 días" in motivo and "D-49" in motivo

    def test_los_dos_descuentos_se_nombran(self):
        motivo = self._motivo(
            self._Cot("97500", "7 a 15 días", "15"), d30="27625"
        )
        assert "D-49" in motivo and "D-30" in motivo

    def test_solo_el_d30_cuando_no_hay_escalon(self):
        motivo = self._motivo(self._Cot(), d30="5000")
        assert motivo == "Descuento por pago total del 100% (D-30)"
