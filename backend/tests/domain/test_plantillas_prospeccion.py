"""
Los mails de prospección ya escritos: que el render nunca deje una variable a
la vista, que la compuerta frene lo que no puede salir, y que el catálogo
cumpla las reglas del copy (largo, asuntos, pie de baja, nada de precios).

Pedido de Gael (21/11/2026): "ya dejarles hechos los mails a Ubicar".
"""
import re

import pytest

from app.domain import plantillas_prospeccion as pl
from app.domain.plantillas_prospeccion import compuerta, hay_graves, renderizar, revisar_plantilla

LINK = "https://api.ubicar.test/api/v1/public/baja/abc.def"
COMPLETOS = {**pl.VALORES_DE_EJEMPLO, "baja": LINK}


class TestRender:
    def test_reemplaza_las_variables(self):
        r = renderizar("Hola {{empresa}} de {{ ciudad }}", {"empresa": "Sur SA", "ciudad": "Bahía Blanca"})
        assert r.texto == "Hola Sur SA de Bahía Blanca" and r.faltantes == ()

    def test_un_tramo_opcional_se_cae_entero_si_falta_un_dato(self):
        texto = "Hola.[[ Vi que están en {{ciudad}}.]] Saludos."
        assert renderizar(texto, {"ciudad": "Punta Alta"}).texto == "Hola. Vi que están en Punta Alta. Saludos."
        r = renderizar(texto, {"ciudad": ""})
        assert r.texto == "Hola. Saludos."
        assert r.faltantes == (), "lo opcional que falta no es un problema: para eso es opcional"

    def test_una_variable_vacia_fuera_de_un_tramo_queda_anotada_y_no_sale_literal(self):
        r = renderizar("Firma: {{firma_nombre}}", {"firma_nombre": None})
        assert r.texto == "Firma:" and r.faltantes == ("firma_nombre",)

    @pytest.mark.parametrize("texto", [
        "Hola {{empresa}} {{inventada}}",
        "Hola [[sin cerrar {{empresa}}",
        "Hola ]] {{ }} {{empresa",
        "[[{{ciudad}}]] [[ {{otra}} ]] }} {{",
        pl.PLANTILLAS[0].cuerpo,
    ])
    @pytest.mark.parametrize("valores", [{}, {"empresa": "X"}, COMPLETOS])
    def test_nunca_queda_una_marca_a_la_vista(self, texto, valores):
        """La garantía: pase lo que pase, a la casilla de nadie le llega un `{{…}}`."""
        salida = renderizar(texto, valores).texto
        assert not re.search(r"\{\{|\}\}|\[\[|\]\]", salida), salida

    def test_una_linea_que_queda_vacia_desaparece(self):
        r = renderizar("Franco\n[[WhatsApp {{firma_telefono}}\n]]www.ubicar-rent.com.ar", {})
        assert r.texto == "Franco\nwww.ubicar-rent.com.ar"

    def test_las_variables_mal_escritas_se_detectan(self):
        assert pl.variables_desconocidas("{{empresa}} {{emrpesa}} {{emrpesa}}") == ["emrpesa"]


class TestCompuerta:
    def _ok(self):
        return "Camionetas para obra", f"Hola.\n\nPara no recibir más mails: {LINK}"

    def test_un_mensaje_prolijo_pasa(self):
        assert compuerta(*self._ok(), link_baja=LINK) == []

    def test_sin_link_de_baja_no_sale(self):
        avisos = compuerta("Asunto", "Hola, ¿cómo están?", link_baja=LINK)
        assert hay_graves(avisos) and "baja" in avisos[0].texto

    def test_una_variable_sin_resolver_no_sale(self):
        asunto, cuerpo = self._ok()
        assert hay_graves(compuerta(asunto, cuerpo + " {{empresa}}", link_baja=LINK))

    def test_el_asunto_largo_avisa_y_el_muy_largo_frena(self):
        _, cuerpo = self._ok()
        medio = compuerta("a" * 60, cuerpo, link_baja=LINK)
        assert medio and not hay_graves(medio)
        assert hay_graves(compuerta("a" * 71, cuerpo, link_baja=LINK))

    def test_el_cuerpo_de_mas_de_1500_caracteres_frena(self):
        asunto, cuerpo = self._ok()
        assert hay_graves(compuerta(asunto, cuerpo + " palabra" * 300, link_baja=LINK))

    @pytest.mark.parametrize("asunto,agregado", [
        ("Alquiler GRATIS por un mes", ""),
        ("Camionetas!!!", ""),
        ("Camionetas", "Una oferta imperdible para ustedes."),
        ("CAMIONETAS PARA SU EMPRESA HOY", ""),
        ("Camionetas", "Desde $ 50000 por día."),
    ])
    def test_las_palabras_de_publicidad_frenan(self, asunto, agregado):
        _, cuerpo = self._ok()
        avisos = compuerta(asunto, f"{agregado}\n{cuerpo}", link_baja=LINK)
        assert hay_graves(avisos), avisos

    def test_gratis_en_minuscula_dentro_de_una_frase_normal_no_frena(self):
        _, cuerpo = self._ok()
        assert not hay_graves(compuerta("Camionetas", "El envío no es gratis.\n" + cuerpo, link_baja=LINK))

    def test_la_plantilla_sin_baja_o_con_la_baja_opcional_se_marca(self):
        assert hay_graves(revisar_plantilla("Asunto", "Hola {{empresa}}"))
        assert hay_graves(revisar_plantilla("Asunto", "Hola [[chau {{baja}}]]"))
        assert hay_graves(revisar_plantilla("Asunto {{empesa}}", "Hola {{baja}}"))
        assert revisar_plantilla("Asunto", "Hola {{empresa}}. {{baja}}") == []


class TestCatalogo:
    def test_hay_una_por_familia_y_una_general(self):
        ids = [p.id for p in pl.PLANTILLAS]
        assert len(ids) == len(set(ids)) and 5 <= len(ids) <= 6 and "general" in ids

    @pytest.mark.parametrize("segmento", [
        "Constructoras y Desarrollo", "Construccion y Maquinaria",
        "Ingenieria y Servicios Industriales", "Montajes y Mantenimiento Industrial",
        "Obradores y Modulos Habitacionales", "Hoteleria y Turismo", "Eventos y Catering",
        "Logistica y Depositos", "Energia y Telecomunicaciones", "Inmobiliarias", "Seguros",
        "Puerto y Comercio Exterior",
    ])
    def test_cada_segmento_de_la_base_tiene_su_plantilla(self, segmento):
        assert pl.plantilla_para_segmento(segmento) != "general"

    def test_con_tilde_o_sin_tilde_es_el_mismo_segmento(self):
        assert pl.plantilla_para_segmento("Hotelería y Turismo") == "turismo_eventos"
        assert pl.plantilla_para_segmento("Algo raro") == "general"
        assert pl.plantilla_para_segmento(None) == "general"

    def test_se_sugiere_la_familia_que_mas_pesa(self):
        assert pl.sugerir({"Constructoras y Desarrollo": 40, "Construccion y Maquinaria": 30, "Seguros": 5}) == "obra"

    def test_una_audiencia_mezclada_va_con_la_general(self):
        assert pl.sugerir({"Constructoras y Desarrollo": 10, "Seguros": 10, "Hoteleria y Turismo": 10}) == "general"
        assert pl.sugerir({}) == "general"

    @pytest.mark.parametrize("p", pl.PLANTILLAS, ids=lambda p: p.id)
    class TestReglasDelCopy:
        def test_tiene_entre_70_y_110_palabras(self, p):
            texto = renderizar(f"{p.mensaje}\n\n{pl.SALIDA}", COMPLETOS).texto
            assert pl.PALABRAS_MINIMO <= pl.contar_palabras(texto) <= pl.PALABRAS_MAXIMO

        def test_los_asuntos_son_cortos_y_sin_gritos(self, p):
            assert 2 <= len(p.asuntos) <= 3
            for a in p.asuntos:
                assert len(a) <= pl.ASUNTO_RECOMENDADO, a
                assert not re.search(r"[!¡]|\{\{", a) and a != a.upper()

        def test_una_sola_pregunta_y_al_final(self, p):
            assert p.mensaje.count("?") == 1 and p.mensaje.rstrip().endswith("?")

        def test_pasa_la_compuerta_con_datos_completos_y_con_lo_minimo(self, p):
            for valores in (COMPLETOS, {"empresa": "Sur SA", "firma_nombre": "Franco", "web": "w", "baja": LINK}):
                cuerpo = renderizar(p.cuerpo, valores)
                assert compuerta(p.asuntos[0], cuerpo.texto, link_baja=LINK) == []
                assert cuerpo.faltantes == ()
            assert revisar_plantilla(p.asuntos[0], p.cuerpo) == []

        def test_no_promete_lo_que_la_web_no_dice(self, p):
            texto = p.cuerpo.lower()
            for prohibido in ("$", "precio", "descuento", "líder", "lider", "mejor", "utilitari",
                              "cuenta corriente", "gratis", "garantiz"):
                assert prohibido not in texto, prohibido

        def test_tiene_la_salida_honesta_y_el_pie_de_baja(self, p):
            assert "respondan «no» y no les escribimos más" in p.cuerpo
            assert p.cuerpo.rstrip().endswith("Para no recibir más mails: {{baja}}")

        def test_los_seguimientos_son_cortos_y_tambien_pasan(self, p):
            segundo, tercero = p.seguimientos
            assert (segundo.dias, tercero.dias) == (5, 12)
            assert "se lo reenvío por si quedó entre otros mails" in segundo.cuerpo.lower()
            assert "no queremos ocuparles la casilla" in tercero.cuerpo
            for s in (segundo, tercero):
                sin_pie = s.cuerpo.split("{{firma_nombre}}")[0]
                assert 30 <= pl.contar_palabras(renderizar(sin_pie, COMPLETOS).texto) <= 50
                listo = renderizar(s.cuerpo, COMPLETOS).texto
                assert compuerta("Re: " + p.asuntos[0], listo, link_baja=LINK) == []

    def test_el_catalogo_que_ve_la_pantalla_trae_todo(self):
        c = pl.catalogo()
        assert {"id", "nombre", "descripcion", "asuntos", "cuerpo", "segmentos", "seguimientos"} <= set(c[0])
        assert len(c[0]["seguimientos"]) == 2
