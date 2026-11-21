"""
Las reglas del envío de prospección: desde qué casilla, cuánto por día, cuándo
se frena y cuándo se manda. Todo puro, sin base ni red.
"""
import base64
from datetime import date, datetime, timezone

import pytest

from app.domain import prospeccion_envio as r
from app.domain.prospectos import mail_valido, motivo_para_no_mandar_mail

RAIZ = "ubicar-rent.com.ar"


class TestLaDireccionDeLaCasilla:
    def test_un_subdominio_se_acepta_y_se_normaliza(self):
        assert r.analizar_direccion(" Franco@Empresas.ubicar-rent.com.ar ", RAIZ) == (
            "franco@empresas.ubicar-rent.com.ar", "empresas.ubicar-rent.com.ar")

    def test_la_raiz_se_rechaza_explicando_por_que(self):
        with pytest.raises(r.DireccionInvalida) as e:
            r.analizar_direccion("franco@ubicar-rent.com.ar", RAIZ)
        assert "reputación" in str(e.value) and "franco@empresas.ubicar-rent.com.ar" in str(e.value)

    @pytest.mark.parametrize("mala", ["", "franco", "franco@", "franco@gmail.com",
                                      "franco@otra-empresa.com.ar", "a b@empresas.ubicar-rent.com.ar"])
    def test_lo_que_no_es_un_subdominio_propio_se_rechaza(self, mala):
        with pytest.raises(r.DireccionInvalida):
            r.analizar_direccion(mala, RAIZ)

    def test_la_raiz_se_deduce_del_remitente_y_se_puede_fijar(self):
        assert r.dominio_raiz("", "noreply@ubicar-rent.com.ar") == RAIZ
        assert r.dominio_raiz("", "Ubicar <reservas@ubicar-rent.com.ar>") == RAIZ
        assert r.dominio_raiz("", "onboarding@resend.dev") == RAIZ, "el de prueba de Resend no es de nadie"
        assert r.dominio_raiz("@otra.com", "noreply@ubicar-rent.com.ar") == "otra.com"

    def test_el_remitente_lleva_el_nombre_visible(self):
        assert r.formatear_remitente('Franco "de" <Ubicar>', "f@e.x.com") == "Franco de Ubicar <f@e.x.com>"
        assert r.formatear_remitente("", "f@e.x.com") == "f@e.x.com"


class TestRampa:
    DESDE = date(2026, 11, 23)

    @pytest.mark.parametrize("dia,cupo", [(0, 15), (6, 15), (7, 25), (13, 25), (14, 30), (90, 30)])
    def test_15_la_primera_semana_25_la_segunda_y_despues_el_limite(self, dia, cupo):
        hoy = date.fromordinal(self.DESDE.toordinal() + dia)
        assert r.cupo_del_dia(30, self.DESDE, hoy) == cupo

    def test_el_limite_de_la_casilla_manda_si_es_mas_chico(self):
        assert r.cupo_del_dia(10, self.DESDE, self.DESDE) == 10

    def test_despues_de_la_rampa_vale_un_limite_mas_alto(self):
        assert r.cupo_del_dia(50, self.DESDE, date(2027, 1, 10)) == 50

    def test_sin_rampa_o_sin_limite_usa_los_valores_por_defecto(self):
        assert r.cupo_del_dia(None, None, self.DESDE) == r.LIMITE_DIA_POR_DEFECTO


class TestReparto:
    def test_elige_la_que_menos_mando_hoy(self):
        a, b = r.Cupo(1, "a@e.x", 15, 7), r.Cupo(2, "b@e.x", 15, 3)
        assert r.elegir([a, b]) is b

    def test_en_empate_va_la_primera_por_orden_alfabetico(self):
        a, b = r.Cupo(1, "b@e.x", 15, 3), r.Cupo(2, "a@e.x", 15, 3)
        assert r.elegir([a, b]) is b

    def test_la_que_no_tiene_cupo_no_juega(self):
        llena, otra = r.Cupo(1, "a@e.x", 15, 15), r.Cupo(2, "b@e.x", 15, 14)
        assert r.elegir([llena, otra]) is otra
        assert r.elegir([llena]) is None and r.elegir([]) is None


class TestFreno:
    def test_una_sola_queja_la_pausa(self):
        assert "queja" in r.evaluar_freno(enviados=200, rebotes_duros=0, quejas=1)

    def test_con_30_o_mas_envios_frena_por_encima_del_3_por_ciento(self):
        assert r.evaluar_freno(enviados=100, rebotes_duros=3, quejas=0) is None
        assert "4,0 %" in r.evaluar_freno(enviados=100, rebotes_duros=4, quejas=0)
        assert r.evaluar_freno(enviados=30, rebotes_duros=1, quejas=0) is not None

    def test_con_menos_de_30_envios_frena_al_tercer_rebote(self):
        assert r.evaluar_freno(enviados=10, rebotes_duros=2, quejas=0) is None
        assert r.evaluar_freno(enviados=10, rebotes_duros=3, quejas=0) is not None

    def test_una_casilla_sana_sigue(self):
        assert r.evaluar_freno(enviados=0, rebotes_duros=0, quejas=0) is None


def _utc(dia, hora_argentina, minuto=0):
    """Una hora de Argentina (UTC-3) de noviembre de 2026, como la guarda la base."""
    return datetime(2026, 11, dia, hora_argentina + 3, minuto)


class TestVentanaHoraria:
    @pytest.mark.parametrize("dia,hora,sale", [
        (23, 9, True), (23, 12, True), (23, 13, False), (23, 14, False), (23, 15, True),
        (23, 17, True), (23, 18, False), (23, 8, False), (23, 20, False),
        (27, 10, True),    # viernes
        (21, 10, False),   # sábado
        (22, 16, False),   # domingo
    ])
    def test_dias_habiles_de_9_a_13_y_de_15_a_18(self, dia, hora, sale):
        assert r.en_ventana(_utc(dia, hora)) is sale

    def test_el_borde_de_la_franja(self):
        assert r.en_ventana(_utc(23, 12, 59)) and not r.en_ventana(_utc(23, 8, 59))

    def test_acepta_una_hora_con_zona(self):
        assert r.en_ventana(datetime(2026, 11, 23, 13, 0, tzinfo=timezone.utc))

    def test_el_dia_del_cupo_arranca_a_la_medianoche_argentina(self):
        assert r.inicio_del_dia(_utc(23, 10)) == datetime(2026, 11, 23, 3, 0)
        # Las 22 de Argentina ya son el día siguiente en UTC: sigue siendo "hoy".
        assert r.inicio_del_dia(datetime(2026, 11, 24, 1, 0)) == datetime(2026, 11, 23, 3, 0)


class TestEstimacion:
    LUNES = _utc(23, 10)

    def test_dos_casillas_nuevas_mandan_30_por_dia_la_primera_semana(self):
        e = r.estimar_fin(60, [(30, date(2026, 11, 23))] * 2, self.LUNES, tope_diario=150)
        assert (e.por_dia, e.dias, e.termina) == (30, 2, date(2026, 11, 24))

    def test_saltea_el_fin_de_semana_y_sigue_la_rampa(self):
        # Semana 1: 15 × 5 días = 75. El lunes siguiente pasa a 25.
        e = r.estimar_fin(100, [(30, date(2026, 11, 23))], self.LUNES, tope_diario=150)
        assert e.termina == date(2026, 11, 30) and e.dias == 6

    def test_el_tope_global_manda_sobre_la_suma_de_las_casillas(self):
        e = r.estimar_fin(40, [(30, None)] * 3, self.LUNES, tope_diario=20)
        assert e.por_dia == 20 and e.dias == 2

    def test_lo_que_ya_salio_hoy_se_descuenta(self):
        e = r.estimar_fin(30, [(30, None)], self.LUNES, tope_diario=150, usados_hoy=20)
        assert e.termina == date(2026, 11, 24)

    def test_si_hoy_ya_cerro_arranca_mañana(self):
        e = r.estimar_fin(5, [(30, None)], _utc(23, 19), tope_diario=150)
        assert e.termina == date(2026, 11, 24)

    def test_sin_casillas_no_se_puede_decir(self):
        assert r.estimar_fin(50, [], self.LUNES, tope_diario=150).termina is None


class TestTokenDeBaja:
    def test_ida_y_vuelta(self):
        t = r.token_de_baja("secreto", 4321)
        assert r.leer_token_de_baja("secreto", t) == 4321

    def test_no_se_puede_adivinar_el_de_otro_cambiando_el_id(self):
        t = r.token_de_baja("secreto", 1)
        otro = base64.urlsafe_b64encode(b"2").rstrip(b"=").decode() + "." + t.split(".")[1]
        assert r.leer_token_de_baja("secreto", otro) is None

    def test_con_otro_secreto_no_vale(self):
        assert r.leer_token_de_baja("otro", r.token_de_baja("secreto", 1)) is None

    @pytest.mark.parametrize("basura", ["", None, "prueba", "a.b", "....", "###.###", "MQ"])
    def test_la_basura_no_rompe(self, basura):
        assert r.leer_token_de_baja("secreto", basura) is None

    def test_es_estable_un_mail_viejo_tiene_que_seguir_sirviendo(self):
        assert r.token_de_baja("s", 7) == r.token_de_baja("s", 7)


class TestRespuestas:
    @pytest.mark.parametrize("asunto", ["Respuesta automática: vacaciones", "Out of Office",
                                        "RE: Fuera de la oficina", "Undeliverable: Camionetas"])
    def test_las_respuestas_automaticas_no_cuentan(self, asunto):
        assert r.es_respuesta_automatica(asunto)

    def test_tambien_se_reconocen_por_la_cabecera(self):
        assert r.es_respuesta_automatica("Re: Camionetas", {"Auto-Submitted": "auto-replied"})
        assert not r.es_respuesta_automatica("Re: Camionetas para obra", {"Auto-Submitted": "no"})

    @pytest.mark.parametrize("texto", ["No", "no.", "No, gracias", "Por favor dar de baja",
                                       "Les pido que no nos escriban más", "No queremos recibir esto",
                                       "unsubscribe"])
    def test_el_no_que_les_pedimos_que_contesten_es_una_baja(self, texto):
        assert r.pide_la_baja(texto)

    @pytest.mark.parametrize("texto", ["Hola, sí, nos interesa. ¿Tienen camionetas en diciembre?",
                                       "No tenemos necesidad ahora pero guardo el contacto",
                                       "La temporada es baja, escribime en marzo", ""])
    def test_una_respuesta_normal_no_es_una_baja(self, texto):
        assert not r.pide_la_baja(texto)


class TestFirmaDelWebhook:
    # El vector de la documentación de Svix (docs.svix.com → verifying payloads manually).
    SECRETO = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
    ID, TS = "msg_p5jXN8AQM9LWM0D4loKWxJek", "1614265330"
    CUERPO = b'{"test": 2432232314}'
    FIRMA = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="
    AHORA = datetime.fromtimestamp(1614265330, tz=timezone.utc)

    def _cab(self, firma=None, ts=None):
        return {"svix-id": self.ID, "svix-timestamp": ts or self.TS, "svix-signature": firma or self.FIRMA}

    def test_el_vector_de_la_documentacion(self):
        assert r.firmar_svix(self.SECRETO, self.ID, self.TS, self.CUERPO) == self.FIRMA
        assert r.verificar_svix(self.SECRETO, self._cab(), self.CUERPO, self.AHORA) == self.ID

    def test_alcanza_con_que_una_de_las_firmas_coincida(self):
        assert r.verificar_svix(self.SECRETO, self._cab(f"v1,otra {self.FIRMA}"), self.CUERPO, self.AHORA)

    def test_el_cuerpo_tocado_o_el_secreto_de_otro_no_pasan(self):
        with pytest.raises(r.FirmaInvalida):
            r.verificar_svix(self.SECRETO, self._cab(), self.CUERPO + b" ", self.AHORA)
        otro = "whsec_" + base64.b64encode(b"otro secreto").decode()
        with pytest.raises(r.FirmaInvalida):
            r.verificar_svix(otro, self._cab(), self.CUERPO, self.AHORA)

    def test_un_evento_viejo_no_se_puede_repetir(self):
        with pytest.raises(r.FirmaInvalida):
            r.verificar_svix(self.SECRETO, self._cab(), self.CUERPO, datetime(2026, 11, 23, 12, 0))

    @pytest.mark.parametrize("cabeceras", [{}, {"svix-id": "x"}, {"svix-id": "x", "svix-timestamp": "ayer",
                                                                   "svix-signature": "v1,x"}])
    def test_sin_cabeceras_o_con_basura_se_rechaza(self, cabeceras):
        with pytest.raises(r.FirmaInvalida):
            r.verificar_svix(self.SECRETO, cabeceras, self.CUERPO, self.AHORA)

    def test_sin_secreto_no_se_valida_nada(self):
        with pytest.raises(r.FirmaInvalida):
            r.verificar_svix("", self._cab(), self.CUERPO, self.AHORA)


class TestAQuienNoLeSaleElMail:
    BASE = dict(ya_cliente=False, no_contactar=False, estado="nuevo", email="compras@sur.com.ar")

    def test_el_que_esta_bien_recibe(self):
        assert motivo_para_no_mandar_mail(**self.BASE) is None

    @pytest.mark.parametrize("cambio,motivo", [
        ({"no_contactar": True}, "pidió que no lo contacten"),
        ({"ya_cliente": True}, "ya es cliente"),
        ({"estado": "descartado"}, "descartado"),
        ({"estado": "respondio"}, "ya respondió"),
        ({"email": None}, "no tiene mail"),
        ({"email": "info@empresa"}, "el mail está mal escrito"),
        ({"mail_repetido": True}, "mismo mail que otra empresa de la lista"),
        ({"en_otra_campana": True}, "ya está en otra campaña en curso"),
        ({"recibio_hace_poco": True}, "recibió un mail nuestro en los últimos 30 días"),
    ])
    def test_cada_motivo(self, cambio, motivo):
        assert motivo_para_no_mandar_mail(**{**self.BASE, **cambio}) == motivo

    def test_dos_mails_pegados_no_son_un_mail(self):
        assert not mail_valido("a@a.com, b@b.com") and mail_valido(" Compras@Sur.com.ar ")
