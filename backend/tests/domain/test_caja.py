"""La caja de Franco: facturado, caja, distribuible y la compensación entre socios."""
from decimal import Decimal

import pytest

from app.domain.caja import (
    caja_de, compensar, distribuible, distribuible_de_cobro, facturado_de,
)

D = Decimal


class TestFacturadoYCaja:
    def test_sin_monto_declarado_manda_el_con_factura(self):
        assert facturado_de(100000, None, True) == D("100000")
        assert facturado_de(100000, None, False) == D("0")

    def test_con_monto_declarado_manda_el_monto(self):
        assert facturado_de(100000, 60000, False) == D("60000")

    def test_el_monto_no_pasa_del_total_ni_baja_de_cero(self):
        assert facturado_de(100000, 150000, True) == D("100000")
        assert facturado_de(100000, -5, True) == D("0")

    def test_caja_es_lo_que_no_se_factura(self):
        assert caja_de(100000, 60000) == D("40000")
        assert caja_de(100000, 100000) == D("0")


class TestDistribuible:
    def test_facturado_dividido_1_25_mas_caja(self):
        # La fila de la planilla: Facturado 125.000 + Caja 40.000.
        assert distribuible(125000, 40000) == D("140000.00")

    def test_todo_en_caja_se_reparte_entero(self):
        assert distribuible(0, 160000) == D("160000.00")

    def test_un_cobro_sigue_la_proporcion_del_alquiler(self):
        # Alquiler de 100.000: 50.000 facturado. Un cobro de 20.000 → 10.000/1,25 + 10.000.
        assert distribuible_de_cobro(20000, 100000, 50000) == D("18000.00")

    def test_un_cobro_suelto_sin_alquiler_es_caja(self):
        assert distribuible_de_cobro(5000, 0, 0) == D("5000.00")


class TestCompensacion:
    FRANCO, MARTIN, RAMIRO = 1, 2, 3

    def test_dos_socios_50_50_como_la_planilla(self):
        c = compensar({1: D("600000"), 2: D("400000")}, {1: D("50"), 2: D("50")})
        assert c.total_cobrado == D("1000000.00")
        assert len(c.transferencias) == 1
        t = c.transferencias[0]
        assert (t.de, t.a, t.monto) == (1, 2, D("100000.00"))

    def test_parejos_no_hay_que_compensar(self):
        c = compensar({1: D("500"), 2: D("500")}, {1: D("50"), 2: D("50")})
        assert c.transferencias == []

    def test_quien_cobra_sin_ser_socio_le_pasa_todo_a_los_socios(self):
        c = compensar({1: D("400000"), 2: D("400000"), 3: D("200000")}, {1: D("50"), 2: D("50")})
        # Cada socio debería tener 500.000; Ramiro cobró 200.000 y no le corresponde nada.
        assert c.saldo[3] == D("200000.00")
        pagos = {(t.de, t.a): t.monto for t in c.transferencias}
        assert pagos == {(3, 1): D("100000.00"), (3, 2): D("100000.00")}

    def test_la_suma_de_lo_que_se_pasa_deja_a_cada_uno_con_su_parte(self):
        cobrado = {1: D("700000"), 2: D("200000"), 3: D("100000")}
        c = compensar(cobrado, {1: D("50"), 2: D("50")})
        final = dict(cobrado)
        for t in c.transferencias:
            final[t.de] -= t.monto
            final[t.a] += t.monto
        assert final[1] == final[2] == D("500000.00")
        assert final[3] == D("0.00")

    def test_porcentajes_distintos(self):
        c = compensar({1: D("1000"), 2: D("0")}, {1: D("60"), 2: D("40")})
        assert c.corresponde == {1: D("600.00"), 2: D("400.00")}
        assert (c.transferencias[0].de, c.transferencias[0].a, c.transferencias[0].monto) == (1, 2, D("400.00"))

    def test_los_porcentajes_tienen_que_sumar_100(self):
        with pytest.raises(ValueError):
            compensar({1: D("1")}, {1: D("50"), 2: D("40")})

    def test_sin_cobros_no_hay_nada_que_pasar(self):
        c = compensar({}, {1: D("50"), 2: D("50")})
        assert c.total_cobrado == D("0.00") and c.transferencias == []
