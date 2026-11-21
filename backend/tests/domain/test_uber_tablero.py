"""
Las cuentas del tablero de Uber (21/11/2026): en qué semana va un contrato, qué
cuotas están pagas, cuántos km lleva permitidos, y cómo se alinean las fechas.
"""
from datetime import date
from decimal import Decimal

from app.domain import uber
from app.domain.uber import Cuota

LUNES = date(2026, 10, 5)  # un lunes


def _cuotas(*vencimientos, monto="200000"):
    return [Cuota(numero=i, vencimiento=v, monto=Decimal(monto)) for i, v in enumerate(vencimientos, 1)]


class TestSemanaEnCurso:
    def test_el_dia_del_retiro_es_la_semana_1(self):
        s = uber.semana_en_curso(LUNES, 28, LUNES)
        assert (s.numero, s.total, s.desde, s.hasta) == (1, 4, LUNES, date(2026, 10, 11))

    def test_al_octavo_dia_empieza_la_2(self):
        assert uber.semana_en_curso(LUNES, 28, date(2026, 10, 11)).numero == 1
        s = uber.semana_en_curso(LUNES, 28, date(2026, 10, 12))
        assert (s.numero, s.desde) == (2, date(2026, 10, 12))

    def test_antes_del_retiro_es_la_1_y_pasado_el_final_la_ultima(self):
        assert uber.semana_en_curso(LUNES, 28, date(2026, 9, 20)).numero == 1
        assert uber.semana_en_curso(LUNES, 28, date(2026, 12, 25)).numero == 4

    def test_la_ultima_semana_de_un_contrato_prorrateado_termina_con_el_contrato(self):
        # 10 días: la semana 2 son sólo tres días.
        s = uber.semana_en_curso(LUNES, 10, date(2026, 10, 13))
        assert (s.numero, s.total, s.hasta) == (2, 2, date(2026, 10, 15))


class TestImputarPagos:
    def test_la_plata_cubre_primero_la_semana_mas_vieja(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12), date(2026, 10, 19))
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("200000"))])
        assert [c.paga for c in cuotas] == [True, False, False]
        assert (cuotas[0].fecha_pago, cuotas[0].medio_pago) == (LUNES, "efectivo")

    def test_un_pago_parcial_deja_la_semana_a_medias(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12))
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("80000"))])
        assert cuotas[0].pagado == Decimal("80000")
        assert cuotas[0].saldo == Decimal("120000")
        assert not cuotas[0].paga

    def test_lo_que_sobra_pasa_a_la_semana_siguiente(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12), date(2026, 10, 19))
        uber.imputar_pagos(cuotas, [
            (LUNES, "efectivo", Decimal("150000")),
            (date(2026, 10, 9), "transferencia", Decimal("300000")),
        ])
        assert [c.pagado for c in cuotas] == [Decimal("200000"), Decimal("200000"), Decimal("50000")]
        # La primera la terminó de cubrir el segundo pago.
        assert cuotas[0].medio_pago == "transferencia"

    def test_cobrar_de_mas_no_rompe_nada(self):
        cuotas = _cuotas(LUNES)
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("999999"))])
        assert cuotas[0].pagado == Decimal("200000")


class TestEstadoDeCuenta:
    def test_sin_nada_vencido_esta_al_dia_y_dice_cuando_paga(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12))
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("200000"))])
        e = uber.estado_de_cuenta(cuotas, date(2026, 10, 8))
        assert e.estado == "al_dia"
        assert e.proxima_fecha == date(2026, 10, 12)
        assert e.adeudado == 0

    def test_vence_hoy(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12))
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("200000"))])
        e = uber.estado_de_cuenta(cuotas, date(2026, 10, 12))
        assert e.estado == "vence_hoy"
        assert e.exigible == Decimal("200000")
        assert e.cuota_a_cobrar.numero == 2

    def test_atrasado_cuenta_dias_semanas_y_plata(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12), date(2026, 10, 19))
        e = uber.estado_de_cuenta(cuotas, date(2026, 10, 14))
        assert e.estado == "atrasado"
        assert e.dias_atraso == 9
        assert e.semanas_adeudadas == 2
        assert e.adeudado == Decimal("400000")
        assert e.proxima_fecha == date(2026, 10, 19)

    def test_un_pago_parcial_no_pone_al_dia(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12))
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("150000"))])
        e = uber.estado_de_cuenta(cuotas, date(2026, 10, 7))
        assert e.estado == "atrasado"
        assert e.adeudado == Decimal("50000")
        assert e.semanas_adeudadas == 1

    def test_lo_exigible_suma_lo_viejo_y_lo_de_hoy(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12), date(2026, 10, 19))
        e = uber.estado_de_cuenta(cuotas, date(2026, 10, 12))
        assert e.estado == "atrasado"
        assert e.adeudado == Decimal("200000")
        assert e.exigible == Decimal("400000")

    def test_todo_pago_no_tiene_proxima_fecha(self):
        cuotas = _cuotas(LUNES)
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("200000"))])
        e = uber.estado_de_cuenta(cuotas, date(2026, 10, 20))
        assert (e.estado, e.proxima_fecha, e.cuota_a_cobrar) == ("al_dia", None, None)

    def test_el_estado_de_cada_cuota(self):
        cuotas = _cuotas(LUNES, date(2026, 10, 12), date(2026, 10, 19), date(2026, 10, 26))
        uber.imputar_pagos(cuotas, [(LUNES, "efectivo", Decimal("200000"))])
        hoy = date(2026, 10, 19)
        assert [c.estado(hoy) for c in cuotas] == ["paga", "vencida", "vence_hoy", "pendiente"]


class TestKmALaFecha:
    def test_el_tope_se_prorratea_por_los_dias_que_pasaron(self):
        assert uber.km_permitidos_a_fecha(1500, LUNES, date(2026, 10, 12), 28) == Decimal("1500.00")
        assert uber.km_permitidos_a_fecha(1400, LUNES, date(2026, 10, 15), 28) == Decimal("2000.00")

    def test_minimo_un_dia_y_maximo_el_contrato(self):
        assert uber.km_permitidos_a_fecha(1400, LUNES, LUNES, 28) == Decimal("200.00")
        assert uber.km_permitidos_a_fecha(1400, LUNES, date(2027, 1, 1), 14) == Decimal("2800.00")

    def test_consumo_pasado_del_tope(self):
        c = uber.consumo_de_km(11_800, 10_000, 1500, 150, LUNES, date(2026, 10, 12), 28)
        assert c["recorridos"] == 1800
        assert c["permitidos"] == Decimal("1500.00")
        assert c["excedidos"] == Decimal("300.00")
        assert c["costo_estimado"] == Decimal("45000.00")
        assert c["porcentaje"] == 120

    def test_consumo_dentro_del_tope(self):
        c = uber.consumo_de_km(11_000, 10_000, 1500, 150, LUNES, date(2026, 10, 12), 28)
        assert (c["excedidos"], c["costo_estimado"]) == (0, 0)

    def test_sin_tope_pactado_solo_informa_lo_recorrido(self):
        c = uber.consumo_de_km(11_000, 10_000, None, None, LUNES, date(2026, 10, 12), 28)
        assert (c["recorridos"], c["permitidos"], c["excedidos"]) == (1000, None, 0)


class TestRealinearFechas:
    def test_con_el_dia_del_retiro_es_lo_mismo_que_la_propuesta(self):
        assert uber.realinear_fechas(LUNES, 21, LUNES.weekday()) == uber.fechas_de_pago(LUNES, 21)

    def test_paga_los_viernes_por_adelantado(self):
        # Retira un miércoles: la primera se paga al retirar, las demás el
        # viernes anterior al comienzo de cada semana.
        miercoles = date(2026, 10, 7)
        assert uber.realinear_fechas(miercoles, 21, 4) == [
            miercoles, date(2026, 10, 9), date(2026, 10, 16),
        ]

    def test_vencido_paga_al_cerrar_cada_semana_y_nunca_despues_de_devolver(self):
        assert uber.realinear_fechas(LUNES, 14, 0, uber.VENCIDO) == [
            date(2026, 10, 12), date(2026, 10, 19),
        ]
        # Paga los viernes: la última caería después de la devolución (lunes 19).
        assert uber.realinear_fechas(LUNES, 14, 4, uber.VENCIDO) == [
            date(2026, 10, 16), date(2026, 10, 19),
        ]

    def test_siempre_una_por_semana_y_en_orden(self):
        for dia in range(7):
            for modalidad in (uber.ADELANTADO, uber.VENCIDO):
                for dias in (1, 7, 8, 10, 28, 30):
                    fechas = uber.realinear_fechas(date(2026, 10, 7), dias, dia, modalidad)
                    assert uber.validar_fechas_de_pago(fechas, dias) is None, (dia, modalidad, dias)


class TestValidarFechas:
    def test_una_por_semana_esta_bien(self):
        assert uber.validar_fechas_de_pago([LUNES, date(2026, 10, 12)], 14) is None

    def test_mover_una_fecha_puntual_se_puede(self):
        assert uber.validar_fechas_de_pago([LUNES, date(2026, 10, 14)], 14) is None

    def test_menos_fechas_que_semanas_no(self):
        msg = uber.validar_fechas_de_pago([LUNES], 14)
        assert "2 semanas" in msg and "1 fecha" in msg

    def test_mas_fechas_que_semanas_tampoco(self):
        assert uber.validar_fechas_de_pago([LUNES, date(2026, 10, 12), date(2026, 10, 19)], 14)

    def test_repetidas_o_desordenadas_no(self):
        assert uber.validar_fechas_de_pago([LUNES, LUNES], 14)
        assert uber.validar_fechas_de_pago([date(2026, 10, 12), LUNES], 14)


class TestRenovacion:
    def test_sigue_el_ritmo_semanal(self):
        previas = [LUNES, date(2026, 10, 12)]
        assert uber.fechas_de_renovacion(LUNES, date(2026, 10, 19), previas, 2) == [
            date(2026, 10, 19), date(2026, 10, 26),
        ]

    def test_respeta_el_dia_en_que_venia_pagando(self):
        # Retira miércoles 7, paga los viernes por adelantado.
        miercoles = date(2026, 10, 7)
        previas = uber.realinear_fechas(miercoles, 14, 4)  # mié 7, vie 9
        nuevas = uber.fechas_de_renovacion(miercoles, date(2026, 10, 21), previas, 2)
        assert nuevas == [date(2026, 10, 16), date(2026, 10, 23)]
        assert all(f.weekday() == 4 for f in nuevas)

    def test_sin_fechas_previas_paga_al_empezar_cada_semana_nueva(self):
        assert uber.fechas_de_renovacion(LUNES, date(2026, 10, 19), [], 1) == [date(2026, 10, 19)]

    def test_nunca_pisa_la_ultima_fecha_que_ya_existia(self):
        previas = [LUNES, date(2026, 10, 20)]  # la segunda corrida a mano
        nuevas = uber.fechas_de_renovacion(LUNES, date(2026, 10, 19), previas, 1)
        assert nuevas[0] > previas[-1]


class TestCondicion:
    def test_un_contrato_nuevo_se_lee_con_su_modalidad_y_su_nota(self):
        assert uber.separar_condicion("Semanal vencido — por transferencia") == ("vencido", "por transferencia")
        assert uber.separar_condicion("Semanal por adelantado") == ("adelantado", "")

    def test_el_texto_libre_viejo_queda_como_nota(self):
        assert uber.separar_condicion("paga los viernes en efectivo") == (
            "adelantado", "paga los viernes en efectivo",
        )
        assert uber.separar_condicion(None) == ("adelantado", "")
