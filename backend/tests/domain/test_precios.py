"""
Tests del motor de precios por calendario (domain/precios.py).

Cubre lo que realmente importa del diseño: que la prioridad mande, que el
desempate sea determinista, que la ausencia de reglas caiga en la tarifa por
banda de siempre, y que el día de devolución no se cobre.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.domain.precios import (
    aplica_descuento_por_duracion,
    ReglaPrecio,
    DescuentoDuracionInfo,
    cotizar,
    regla_aplica,
    resolver_regla_dia,
    seleccionar_descuento,
)
from app.core.exceptions import BusinessRuleError


def regla(**kw) -> ReglaPrecio:
    """Regla base con valores razonables; los tests pisan sólo lo que miran."""
    base = dict(
        id=1,
        nombre="Base anual",
        precio_dia=Decimal("100000"),
        fecha_desde=date(2026, 1, 1),
        fecha_hasta=date(2026, 12, 31),
        prioridad=0,
    )
    base.update(kw)
    return ReglaPrecio(**base)


# ─── regla_aplica ─────────────────────────────────────────────────────────────

class TestReglaAplica:
    def _aplica(self, r, dia, duracion=3, cat=None, veh=None, canal="mostrador"):
        return regla_aplica(r, dia, duracion, cat, veh, canal)

    def test_dentro_del_rango(self):
        assert self._aplica(regla(), date(2026, 6, 15))

    def test_fuera_del_rango(self):
        assert not self._aplica(
            regla(fecha_desde=date(2026, 1, 1), fecha_hasta=date(2026, 1, 31)),
            date(2026, 6, 15),
        )

    def test_limites_del_rango_son_inclusivos(self):
        r = regla(fecha_desde=date(2026, 6, 1), fecha_hasta=date(2026, 6, 30))
        assert self._aplica(r, date(2026, 6, 1))
        assert self._aplica(r, date(2026, 6, 30))

    def test_dias_semana_filtra(self):
        # 2026-06-15 es lunes (ISO 1), 2026-06-20 es sábado (ISO 6).
        r = regla(dias_semana=[6, 7])
        assert not self._aplica(r, date(2026, 6, 15))
        assert self._aplica(r, date(2026, 6, 20))

    def test_dias_semana_vacio_o_none_no_filtra(self):
        assert self._aplica(regla(dias_semana=None), date(2026, 6, 15))
        assert self._aplica(regla(dias_semana=[]), date(2026, 6, 15))

    def test_min_dias_mira_la_duracion_total(self):
        r = regla(min_dias=3)
        assert not self._aplica(r, date(2026, 6, 15), duracion=2)
        assert self._aplica(r, date(2026, 6, 15), duracion=3)

    def test_max_dias(self):
        r = regla(max_dias=5)
        assert self._aplica(r, date(2026, 6, 15), duracion=5)
        assert not self._aplica(r, date(2026, 6, 15), duracion=6)

    def test_canal_web_no_aplica_en_mostrador(self):
        r = regla(canal="web")
        assert not self._aplica(r, date(2026, 6, 15), canal="mostrador")
        assert self._aplica(r, date(2026, 6, 15), canal="web")

    def test_canal_ambos_aplica_siempre(self):
        r = regla(canal="ambos")
        assert self._aplica(r, date(2026, 6, 15), canal="web")
        assert self._aplica(r, date(2026, 6, 15), canal="mostrador")

    def test_regla_de_categoria_solo_aplica_a_esa_categoria(self):
        r = regla(categoria_id=3)
        assert self._aplica(r, date(2026, 6, 15), cat=3)
        assert not self._aplica(r, date(2026, 6, 15), cat=4)
        assert not self._aplica(r, date(2026, 6, 15), cat=None)

    def test_regla_general_aplica_a_cualquier_categoria(self):
        r = regla()
        assert self._aplica(r, date(2026, 6, 15), cat=3)
        assert self._aplica(r, date(2026, 6, 15), cat=None)

    def test_regla_de_vehiculo_solo_aplica_a_ese_vehiculo(self):
        r = regla(vehiculo_id=7)
        assert self._aplica(r, date(2026, 6, 15), veh=7)
        assert not self._aplica(r, date(2026, 6, 15), veh=8)


# ─── resolver_regla_dia — el desempate ────────────────────────────────────────

class TestResolverReglaDia:
    def test_sin_reglas_devuelve_none(self):
        assert resolver_regla_dia(date(2026, 6, 15), [], 3) is None

    def test_gana_la_de_mayor_prioridad(self):
        base = regla(id=1, nombre="Base", prioridad=0, precio_dia=Decimal("100000"))
        navidad = regla(id=2, nombre="Navidad", prioridad=10, precio_dia=Decimal("150000"))
        elegida = resolver_regla_dia(date(2026, 6, 15), [base, navidad], 3)
        assert elegida.nombre == "Navidad"

    def test_el_orden_de_la_lista_no_importa(self):
        base = regla(id=1, nombre="Base", prioridad=0)
        promo = regla(id=2, nombre="Promo", prioridad=20)
        assert resolver_regla_dia(date(2026, 6, 15), [promo, base], 3).nombre == "Promo"
        assert resolver_regla_dia(date(2026, 6, 15), [base, promo], 3).nombre == "Promo"

    def test_las_tres_capas_del_plan(self):
        """Base anual (0) < fecha especial (10) < promo (20). La promo gana."""
        capas = [
            regla(id=1, nombre="Base anual", prioridad=0, precio_dia=Decimal("100000")),
            regla(id=2, nombre="Fiestas", prioridad=10, precio_dia=Decimal("150000"),
                  fecha_desde=date(2026, 12, 20), fecha_hasta=date(2027, 1, 6)),
            regla(id=3, nombre="Promo Navidad", prioridad=20, precio_dia=Decimal("120000"),
                  fecha_desde=date(2026, 12, 24), fecha_hasta=date(2026, 12, 26),
                  es_promocional=True, etiqueta_promo="Promo Navidad"),
        ]
        assert resolver_regla_dia(date(2026, 6, 15), capas, 3).nombre == "Base anual"
        assert resolver_regla_dia(date(2026, 12, 22), capas, 3).nombre == "Fiestas"
        assert resolver_regla_dia(date(2026, 12, 25), capas, 3).nombre == "Promo Navidad"

    def test_dar_de_baja_la_promo_devuelve_el_precio_de_abajo(self):
        """La propiedad importante: apilar no destruye lo de abajo."""
        base = regla(id=1, nombre="Base", prioridad=0, precio_dia=Decimal("100000"))
        promo = regla(id=2, nombre="Promo", prioridad=20, precio_dia=Decimal("80000"))
        assert resolver_regla_dia(date(2026, 6, 15), [base, promo], 3).precio_dia == Decimal("80000")
        # Se da de baja la promo (el service no la incluye) → vuelve la base.
        assert resolver_regla_dia(date(2026, 6, 15), [base], 3).precio_dia == Decimal("100000")

    def test_empate_de_prioridad_gana_la_mas_especifica(self):
        general = regla(id=1, nombre="General", prioridad=10)
        de_categoria = regla(id=2, nombre="Categoría", prioridad=10, categoria_id=3)
        del_vehiculo = regla(id=3, nombre="Vehículo", prioridad=10, vehiculo_id=7)
        elegida = resolver_regla_dia(
            date(2026, 6, 15), [general, de_categoria, del_vehiculo], 3,
            categoria_id=3, vehiculo_id=7,
        )
        assert elegida.nombre == "Vehículo"

    def test_la_prioridad_le_gana_a_la_especificidad(self):
        """
        Decisión explícita: el eje que el dueño carga a mano manda sobre la
        especificidad implícita. Una promo de categoría en 20 le gana a un
        precio de vehículo puntual en 0.
        """
        del_vehiculo = regla(id=1, nombre="Vehículo", prioridad=0, vehiculo_id=7)
        promo_categoria = regla(id=2, nombre="Promo", prioridad=20, categoria_id=3)
        elegida = resolver_regla_dia(
            date(2026, 6, 15), [del_vehiculo, promo_categoria], 3,
            categoria_id=3, vehiculo_id=7,
        )
        assert elegida.nombre == "Promo"

    def test_empate_total_gana_el_rango_mas_corto(self):
        temporada = regla(id=1, nombre="Temporada alta", prioridad=10,
                          fecha_desde=date(2026, 12, 1), fecha_hasta=date(2027, 2, 28))
        semana = regla(id=2, nombre="Semana de Navidad", prioridad=10,
                       fecha_desde=date(2026, 12, 24), fecha_hasta=date(2026, 12, 26))
        elegida = resolver_regla_dia(date(2026, 12, 25), [temporada, semana], 3)
        assert elegida.nombre == "Semana de Navidad"

    def test_empate_absoluto_gana_el_id_mas_alto(self):
        vieja = regla(id=1, nombre="Vieja", prioridad=10)
        nueva = regla(id=2, nombre="Nueva", prioridad=10)
        assert resolver_regla_dia(date(2026, 6, 15), [vieja, nueva], 3).nombre == "Nueva"


# ─── seleccionar_descuento ────────────────────────────────────────────────────

class TestSeleccionarDescuento:
    def test_sin_descuentos(self):
        assert seleccionar_descuento(10, []) is None

    def test_por_debajo_del_minimo_no_aplica(self):
        d = DescuentoDuracionInfo(id=1, nombre="7+", dias_desde=7, porcentaje=Decimal("10"))
        assert seleccionar_descuento(6, [d]) is None
        assert seleccionar_descuento(7, [d]) is d

    def test_dias_hasta_none_es_sin_tope(self):
        d = DescuentoDuracionInfo(id=1, nombre="30+", dias_desde=30, porcentaje=Decimal("20"))
        assert seleccionar_descuento(365, [d]) is d

    def test_respeta_el_tope(self):
        d = DescuentoDuracionInfo(id=1, nombre="7 a 29", dias_desde=7, dias_hasta=29,
                                  porcentaje=Decimal("10"))
        assert seleccionar_descuento(30, [d]) is None

    def test_si_solapan_gana_el_mayor_porcentaje(self):
        """El cliente no puede salir perdiendo por un solapamiento mal cargado."""
        chico = DescuentoDuracionInfo(id=1, nombre="7+", dias_desde=7, porcentaje=Decimal("10"))
        grande = DescuentoDuracionInfo(id=2, nombre="30+", dias_desde=30, porcentaje=Decimal("20"))
        assert seleccionar_descuento(35, [chico, grande]) is grande

    def test_descuento_de_otra_categoria_no_aplica(self):
        d = DescuentoDuracionInfo(id=1, nombre="SUV 7+", dias_desde=7,
                                  porcentaje=Decimal("10"), categoria_id=3)
        assert seleccionar_descuento(10, [d], categoria_id=4) is None
        assert seleccionar_descuento(10, [d], categoria_id=3) is d


# ─── cotizar ──────────────────────────────────────────────────────────────────

class TestCotizar:
    def test_no_cobra_el_dia_de_devolucion(self):
        """21/05 → 23/05 son 2 días (21 y 22), igual que tarifas.calcular_duracion_dias."""
        c = cotizar(date(2026, 5, 21), date(2026, 5, 23), [regla()],
                    precio_fallback=Decimal("100000"))
        assert c.duracion_dias == 2
        assert len(c.dias) == 2
        assert [d.fecha for d in c.dias] == [date(2026, 5, 21), date(2026, 5, 22)]

    def test_rango_invalido(self):
        with pytest.raises(BusinessRuleError) as e:
            cotizar(date(2026, 5, 23), date(2026, 5, 21), [], precio_fallback=Decimal("1"))
        assert e.value.rule == "rango_invalido"

    def test_mismo_dia_es_invalido(self):
        with pytest.raises(BusinessRuleError):
            cotizar(date(2026, 5, 21), date(2026, 5, 21), [], precio_fallback=Decimal("1"))

    def test_sin_reglas_usa_la_tarifa_por_banda(self):
        """Compatibilidad: un sistema sin nada cargado cotiza como siempre."""
        c = cotizar(date(2026, 5, 21), date(2026, 5, 24), [],
                    precio_fallback=Decimal("50000"))
        assert c.total == Decimal("150000")
        assert all(d.origen == "banda" for d in c.dias)

    def test_sin_reglas_y_sin_fallback_falla_en_vez_de_cobrar_cero(self):
        with pytest.raises(BusinessRuleError) as e:
            cotizar(date(2026, 5, 21), date(2026, 5, 24), [], precio_fallback=None)
        assert e.value.rule == "sin_precio_para_el_dia"

    def test_mezcla_calendario_y_banda_en_el_mismo_alquiler(self):
        """Los días que ninguna regla cubre caen a la banda, uno por uno."""
        r = regla(precio_dia=Decimal("80000"),
                  fecha_desde=date(2026, 5, 22), fecha_hasta=date(2026, 5, 22))
        c = cotizar(date(2026, 5, 21), date(2026, 5, 24), [r],
                    precio_fallback=Decimal("50000"))
        assert [d.origen for d in c.dias] == ["banda", "calendario", "banda"]
        assert c.total == Decimal("180000")   # 50k + 80k + 50k

    def test_precio_distinto_por_dia_de_semana(self):
        """Del viernes 2026-05-22 al lunes 25: sáb y dom más caros."""
        finde = regla(id=2, nombre="Finde", prioridad=10, precio_dia=Decimal("90000"),
                      dias_semana=[6, 7])
        c = cotizar(date(2026, 5, 22), date(2026, 5, 25), [regla(), finde],
                    precio_fallback=Decimal("50000"))
        precios = [d.precio for d in c.dias]
        assert precios == [Decimal("100000"), Decimal("90000"), Decimal("90000")]

    def test_descuento_por_duracion(self):
        d = DescuentoDuracionInfo(id=1, nombre="7+", dias_desde=7, porcentaje=Decimal("10"))
        c = cotizar(date(2026, 5, 1), date(2026, 5, 11), [regla()],
                    precio_fallback=Decimal("100000"), descuentos=[d])
        assert c.duracion_dias == 10
        assert c.subtotal == Decimal("1000000.00")
        assert c.descuento_porcentaje == Decimal("10")
        assert c.descuento_monto == Decimal("100000.00")
        assert c.total == Decimal("900000.00")
        assert c.descuento_nombre == "7+"

    def test_promocion_expone_etiqueta_y_precio_de_lista(self):
        promo = regla(id=2, nombre="Promo Día del Amigo", prioridad=20,
                      precio_dia=Decimal("68000"), precio_referencia=Decimal("85000"),
                      es_promocional=True, etiqueta_promo="Promo Día del Amigo")
        c = cotizar(date(2026, 7, 20), date(2026, 7, 22), [promo],
                    precio_fallback=Decimal("85000"))
        assert c.tiene_promocion
        assert c.promociones == ["Promo Día del Amigo"]
        assert c.total == Decimal("136000.00")            # 68.000 × 2
        assert c.total_referencia == Decimal("170000.00")  # 85.000 × 2
        assert c.dias[0].precio_referencia == Decimal("85000")

    def test_precio_referencia_menor_al_cobrado_se_ignora(self):
        """No se le muestra al cliente un 'descuento' que lo encarece."""
        mal = regla(precio_dia=Decimal("100000"), precio_referencia=Decimal("80000"),
                    es_promocional=True, etiqueta_promo="Rara")
        c = cotizar(date(2026, 5, 21), date(2026, 5, 22), [mal],
                    precio_fallback=Decimal("100000"))
        assert c.dias[0].precio_referencia is None
        assert c.total_referencia == c.total

    def test_sin_promo_la_referencia_iguala_al_subtotal(self):
        c = cotizar(date(2026, 5, 21), date(2026, 5, 24), [regla()],
                    precio_fallback=Decimal("50000"))
        assert c.total_referencia == c.subtotal

    def test_canal_web_ve_un_precio_y_mostrador_otro(self):
        solo_web = regla(id=2, nombre="Promo online", prioridad=20,
                         precio_dia=Decimal("70000"), canal="web")
        args = (date(2026, 5, 21), date(2026, 5, 23), [regla(), solo_web])
        web = cotizar(*args, precio_fallback=Decimal("100000"), canal="web")
        mostrador = cotizar(*args, precio_fallback=Decimal("100000"), canal="mostrador")
        assert web.total == Decimal("140000.00")
        assert mostrador.total == Decimal("200000.00")

    def test_el_desglose_dice_de_donde_salio_cada_precio(self):
        r = regla(id=9, nombre="Temporada alta", prioridad=10, precio_dia=Decimal("120000"))
        c = cotizar(date(2026, 5, 21), date(2026, 5, 22), [r],
                    precio_fallback=Decimal("100000"))
        assert c.dias[0].regla_id == 9
        assert c.dias[0].regla_nombre == "Temporada alta"

    def test_precio_dia_promedio(self):
        c = cotizar(date(2026, 5, 1), date(2026, 5, 11), [regla()],
                    precio_fallback=Decimal("100000"),
                    descuentos=[DescuentoDuracionInfo(
                        id=1, nombre="7+", dias_desde=7, porcentaje=Decimal("10"))])
        assert c.precio_dia_promedio == Decimal("90000.00")


# ─── Adicionales ──────────────────────────────────────────────────────────────

from app.domain.precios import (  # noqa: E402
    AdicionalSolicitado,
    cotizar_adicionales,
    validar_seleccion_adicionales,
)


def adic(**kw) -> AdicionalSolicitado:
    base = dict(id=1, nombre="Seguro full", precio_unitario=Decimal("10000"))
    base.update(kw)
    return AdicionalSolicitado(**base)


class TestCotizarAdicionales:
    def test_sin_adicionales(self):
        cotizados, total = cotizar_adicionales([], 5)
        assert cotizados == []
        assert total == Decimal("0")

    def test_por_dia_multiplica_por_la_duracion(self):
        _, total = cotizar_adicionales([adic(unidad_cobro="por_dia")], 5)
        assert total == Decimal("50000.00")

    def test_unico_ignora_la_duracion(self):
        _, total = cotizar_adicionales([adic(unidad_cobro="unico")], 5)
        assert total == Decimal("10000.00")

    def test_cantidad_multiplica(self):
        _, total = cotizar_adicionales(
            [adic(nombre="Silla de bebé", unidad_cobro="unico", cantidad=2)], 5
        )
        assert total == Decimal("20000.00")

    def test_cantidad_y_dias_se_combinan(self):
        _, total = cotizar_adicionales([adic(unidad_cobro="por_dia", cantidad=2)], 3)
        assert total == Decimal("60000.00")

    def test_cantidad_cero_falla(self):
        with pytest.raises(BusinessRuleError) as e:
            cotizar_adicionales([adic(cantidad=0)], 3)
        assert e.value.rule == "cantidad_invalida"

    def test_devuelve_el_detalle_de_cada_uno(self):
        cotizados, _ = cotizar_adicionales([
            adic(id=1, nombre="Seguro full", unidad_cobro="por_dia"),
            adic(id=2, nombre="GPS", precio_unitario=Decimal("5000"), unidad_cobro="unico"),
        ], 4)
        assert [c.nombre for c in cotizados] == ["Seguro full", "GPS"]
        assert [c.subtotal for c in cotizados] == [Decimal("40000.00"), Decimal("5000.00")]


class TestValidarSeleccionAdicionales:
    def test_una_sola_cobertura_es_valida(self):
        validar_seleccion_adicionales([adic(grupo="cobertura")])

    def test_dos_coberturas_fallan(self):
        with pytest.raises(BusinessRuleError) as e:
            validar_seleccion_adicionales([
                adic(id=1, nombre="Intermedia", grupo="cobertura"),
                adic(id=2, nombre="Full", grupo="cobertura"),
            ])
        assert e.value.rule == "coberturas_excluyentes"

    def test_varios_extras_son_validos(self):
        validar_seleccion_adicionales([
            adic(id=1, nombre="GPS", grupo="extra"),
            adic(id=2, nombre="Cadenas", grupo="extra"),
            adic(id=3, nombre="Silla", grupo="extra"),
        ])


class TestCotizarConAdicionales:
    def test_se_suman_al_total(self):
        c = cotizar(date(2026, 5, 21), date(2026, 5, 24), [regla()],
                    precio_fallback=Decimal("100000"),
                    adicionales=[adic(unidad_cobro="por_dia")])
        assert c.subtotal_vehiculo == Decimal("300000.00")
        assert c.total_adicionales == Decimal("30000.00")
        assert c.total == Decimal("330000.00")

    def test_el_descuento_por_duracion_NO_toca_los_adicionales(self):
        """El descuento bonifica el alquiler del auto, no el seguro."""
        d = DescuentoDuracionInfo(id=1, nombre="7+", dias_desde=7, porcentaje=Decimal("10"))
        c = cotizar(date(2026, 5, 1), date(2026, 5, 11), [regla()],
                    precio_fallback=Decimal("100000"), descuentos=[d],
                    adicionales=[adic(unidad_cobro="por_dia")])
        assert c.subtotal == Decimal("1000000.00")
        assert c.descuento_monto == Decimal("100000.00")
        assert c.subtotal_vehiculo == Decimal("900000.00")
        assert c.total_adicionales == Decimal("100000.00")   # 10.000 × 10 días, sin descuento
        assert c.total == Decimal("1000000.00")

    def test_dos_coberturas_rompen_la_cotizacion(self):
        with pytest.raises(BusinessRuleError):
            cotizar(date(2026, 5, 21), date(2026, 5, 24), [regla()],
                    precio_fallback=Decimal("100000"),
                    adicionales=[
                        adic(id=1, nombre="Intermedia", grupo="cobertura"),
                        adic(id=2, nombre="Full", grupo="cobertura"),
                    ])

    def test_precio_dia_promedio_excluye_adicionales(self):
        c = cotizar(date(2026, 5, 21), date(2026, 5, 24), [regla()],
                    precio_fallback=Decimal("100000"),
                    adicionales=[adic(unidad_cobro="por_dia")])
        assert c.precio_dia_promedio == Decimal("100000.00")


# ─── La escalera por duración (D-43) ──────────────────────────────────────────
#
# El precio de una categoría es UN número —cuánto sale un día al 100%— y el
# largo del alquiler se descuenta con porcentajes. Estas bandas son las que
# siembra la migración 054, y este bloque las fija: si alguien las cambia sin
# querer, el test lo dice antes que la facturación.

ESCALERA = [
    DescuentoDuracionInfo(id=1, nombre="3 a 6 días", dias_desde=3, dias_hasta=6,
                          porcentaje=Decimal("10")),
    DescuentoDuracionInfo(id=2, nombre="7 a 15 días", dias_desde=7, dias_hasta=15,
                          porcentaje=Decimal("15")),
    DescuentoDuracionInfo(id=3, nombre="16 días o más", dias_desde=16, dias_hasta=None,
                          porcentaje=Decimal("30")),
]


class TestEscaleraPorDuracion:
    @pytest.mark.parametrize("dias,porcentaje", [
        (1, 0), (2, 0),                      # precio de lista
        (3, 10), (4, 10), (6, 10),
        (7, 15), (14, 15), (15, 15),         # el 15 entra: no queda hueco
        (16, 30), (30, 30),
        (31, 30), (60, 30), (365, 30),       # la última banda no tiene tope
    ])
    def test_cada_duracion_cae_en_su_escalon(self, dias, porcentaje):
        d = seleccionar_descuento(dias, ESCALERA)
        assert (Decimal(porcentaje) if d is None else d.porcentaje) == Decimal(porcentaje)

    def _porcentaje(self, dias: int) -> Decimal:
        d = seleccionar_descuento(dias, ESCALERA)
        return d.porcentaje if d else Decimal("0")

    def test_el_precio_por_dia_nunca_sube_al_alargar(self):
        """
        La invariante de la escalera: más días nunca puede salir más caro **por
        día**. Es lo que rompe un hueco (el día 15 sin banda volvería al 100%
        entre dos tramos con descuento) y lo que rompe una última banda con
        tope (el día 31 volvería al 100%).
        """
        porcentajes = [self._porcentaje(d) for d in range(1, 400)]
        assert porcentajes == sorted(porcentajes), (
            "hay un día en el que el descuento baja: alargar el alquiler lo encarece por día"
        )

    def test_el_salto_de_15_a_30_deja_un_tramo_donde_conviene_alargar(self):
        """
        **Consecuencia conocida de la escalera, no un bug.**

        El salto del 15% al 30% es grande, así que 16 días (−30%, 1.120.000)
        sale menos plata que 14 (1.190.000) y que 15 (1.275.000). A un cliente
        que pide 15 días le conviene llevárselo 16. Con 13 no pasa: 1.105.000
        ya está por debajo, así que el tramo es exactamente 14 y 15.

        Se deja fijado en un test para que sea una decisión y no una sorpresa:
        si algún día se quiere que el total tampoco baje, hay que suavizar el
        salto (por ejemplo 20% en el tramo del medio). Mientras tanto, la web
        se lo ofrece sola — ver `AhorroPorDuracion`.
        """
        precio_dia = Decimal("100000")

        def total(dias: int) -> Decimal:
            return precio_dia * dias * (Decimal("100") - self._porcentaje(dias)) / Decimal("100")

        conviene_alargar = [
            dias for dias in range(1, 60)
            if any(total(mas) < total(dias) for mas in range(dias + 1, 61))
        ]
        assert conviene_alargar == [14, 15]

    def test_el_descuento_sale_del_total_de_los_dias(self):
        """20 días a $100.000: 2.000.000 − 30% = 1.400.000."""
        c = cotizar(date(2026, 5, 1), date(2026, 5, 21), [],
                    precio_fallback=Decimal("100000"), descuentos=ESCALERA)
        assert c.duracion_dias == 20
        assert c.subtotal == Decimal("2000000.00")
        assert c.descuento_porcentaje == Decimal("30")
        assert c.subtotal_vehiculo == Decimal("1400000.00")
        assert c.descuento_nombre == "16 días o más"


class TestDescuentoPorDuracionSoloConPagoTotal:
    """
    En la web el descuento por duración se gana pagando el 100% por adelantado.
    En el mostrador va siempre.

    El test que más importa es `test_el_cobro_usa_el_mismo_criterio_que_la_vista`:
    si la cotización que se le muestra al cliente y la que se cobra no reciben
    el mismo anticipo, se le cobra de más justo a quien más adelanta.
    """

    def test_en_el_mostrador_siempre_aplica(self):
        assert aplica_descuento_por_duracion("mostrador", None)
        assert aplica_descuento_por_duracion("mostrador", 30)
        assert aplica_descuento_por_duracion("mostrador", 100)

    def test_en_la_web_solo_con_el_100(self):
        assert aplica_descuento_por_duracion("web", 100)

    def test_en_la_web_con_sena_parcial_no(self):
        assert not aplica_descuento_por_duracion("web", 30)
        assert not aplica_descuento_por_duracion("web", 50)
        assert not aplica_descuento_por_duracion("web", 99)

    def test_sin_elegir_todavia_no_aplica(self):
        """Pasos 1 a 3: se muestra el precio de lista y el descuento aparece
        como mejora al elegir el pago total. Al revés, el precio subiría al
        elegir pagar menos y se leería como un recargo escondido."""
        assert not aplica_descuento_por_duracion("web", None)


# ─── Los tres montos del paso 4 ───────────────────────────────────────────────

class TestLosTresMontosDelPaso4:
    """
    Las tarjetas de 30 / 50 / 100% del checkout web, con el caso que las rompió.

    **Cada opción sale de un precio distinto**: con seña parcial se cobra el
    precio de lista y con el 100% corre el descuento por duración (D-49). El
    front estimaba las tres multiplicando un solo total, así que la del 100%
    mostraba el precio **sin** descuento —$172.500 en vez de $146.625— y el
    cliente no veía los $25.875 que se ahorraba justo en la opción que más le
    convenía. Sólo bajaba al tocarla, cuando ya había decidido.

    Acá se fija la composición que hace `POST /public/cotizar`: dos pasadas por
    `cotizar` (una por escenario) y `calcular_anticipo` sobre cada una. Son las
    mismas dos funciones puras que usa `PagoWebService` para decidir cuánto se
    cobra de verdad, así que si esto pasa, el botón muestra el monto que va a
    la pasarela.
    """

    # 9 días a $172.500 en total. Los precios diarios vienen como lista porque
    # es lo que devuelve `cotizar_por_bandas` desde D-35: el precio de un día
    # depende del bloque al que pertenece.
    PRECIOS_DIA = [Decimal("19166.67")] * 8 + [Decimal("19166.64")]
    INICIO = date(2026, 9, 1)
    FIN = date(2026, 9, 10)          # 9 días: el de devolución no se cobra

    def _cotizar(self, anticipo):
        return cotizar(
            self.INICIO, self.FIN, [],
            precio_fallback=self.PRECIOS_DIA,
            descuentos=ESCALERA,
            canal="web",
            porcentaje_anticipo=anticipo,
        )

    def test_el_caso_de_9_dias(self):
        """
        Nueve días caen en el escalón de 7 a 15 (−15%). Los tres montos que
        tiene que mostrar la pantalla, al peso.
        """
        from app.domain.pagos_web import calcular_anticipo

        lista = self._cotizar(30)
        c100 = self._cotizar(100)

        assert lista.duracion_dias == 9
        assert lista.total == Decimal("172500.00")
        assert lista.descuento_monto == Decimal("0.00")

        assert c100.descuento_porcentaje == Decimal("15")
        assert c100.descuento_nombre == "7 a 15 días"
        assert c100.total == Decimal("146625.00")

        montos = {
            p: calcular_anticipo(c100.total if p == 100 else lista.total, p)
            for p in (30, 50, 100)
        }
        assert montos[30].monto_a_cobrar == Decimal("51750.00")
        assert montos[50].monto_a_cobrar == Decimal("86250.00")
        # Lo que estaba mal: acá salía 172.500, el total sin descuento.
        assert montos[100].monto_a_cobrar == Decimal("146625.00")

        # Y el número que hace cambiar de opción, en plata.
        assert lista.total - montos[100].total_final == Decimal("25875.00")

    def test_la_sena_parcial_deja_saldo_y_el_pago_total_no(self):
        from app.domain.pagos_web import calcular_anticipo

        lista = self._cotizar(30)
        c100 = self._cotizar(100)

        assert calcular_anticipo(lista.total, 30).saldo == Decimal("120750.00")
        assert calcular_anticipo(lista.total, 50).saldo == Decimal("86250.00")
        assert calcular_anticipo(c100.total, 100).saldo == Decimal("0.00")

    def test_el_descuento_por_pago_total_se_apila_sobre_el_de_duracion(self):
        """
        D-30 (palanca de `configuracion`) va **arriba** de D-43, no en su lugar.
        Con 5%: 146.625 − 7.331,25 = 139.293,75, y el ahorro contra la seña
        parcial pasa de 25.875 a 33.206,25.
        """
        from app.domain.pagos_web import calcular_anticipo

        lista = self._cotizar(30)
        a = calcular_anticipo(self._cotizar(100).total, 100, Decimal("5"))

        assert a.descuento == Decimal("7331.25")
        assert a.total_final == Decimal("139293.75")
        assert lista.total - a.total_final == Decimal("33206.25")

    def test_sin_escalon_no_hay_dos_escenarios(self):
        """
        Dos días no llegan al primer escalón: pagar todo no cambia el precio.
        La pantalla no puede prometer un ahorro que no existe.
        """
        from app.domain.pagos_web import calcular_anticipo

        corto = dict(precio_fallback=Decimal("100000"), descuentos=ESCALERA,
                     canal="web")
        lista = cotizar(date(2026, 9, 1), date(2026, 9, 3), [],
                        porcentaje_anticipo=30, **corto)
        c100 = cotizar(date(2026, 9, 1), date(2026, 9, 3), [],
                       porcentaje_anticipo=100, **corto)

        assert c100.descuento_monto == Decimal("0.00")
        assert c100.total == lista.total == Decimal("200000.00")
        assert lista.total - calcular_anticipo(c100.total, 100).total_final == 0
