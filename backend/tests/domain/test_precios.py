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
