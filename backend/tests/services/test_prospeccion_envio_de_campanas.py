"""
El envío de las campañas de prospección, de punta a punta y sin salir a la red:
casillas en subdominios → campaña rápida → motor → lo que vuelve (entregado,
rebote, queja, respuesta) → seguimientos → baja.

Pedido de Gael (21/11/2026): que crear y mandar una campaña sea rápido, con los
mails ya escritos y desde casillas propias de Ubicar en un subdominio.

Resend está falseado en los dos frentes: `EnviadorSimulado` para los mails y
`ResendDominiosFalso` para los dominios.
"""
import base64
import json
import time as _time
from datetime import date, datetime, timedelta

import pytest

from app.adapters.resend_dominios import ResendDominiosFalso
from app.adapters.resend_prospeccion import EnviadorSimulado, ResultadoProspeccion
from app.config import settings
from app.core.exceptions import BusinessRuleError, ConflictError
from app.domain import plantillas_prospeccion as plantillas
from app.domain import prospeccion_envio as reglas
from app.models.prospecto import (
    CampanaDestinatario, CampanaEnvio, CampanaProspecto, CasillaProspeccion, Prospecto,
)
from app.services.prospeccion_service import ProspeccionService, secreto_de_baja, url_de_baja
from app.services.prospecto_service import ProspectoService

API = "/api/v1"
LUNES = datetime(2026, 11, 23, 13, 0)        # las 10:00 de Argentina, día hábil
SABADO = datetime(2026, 11, 28, 13, 0)
OBRA = plantillas.plantilla("obra")


@pytest.fixture
def enviador():
    return EnviadorSimulado()


@pytest.fixture
def svc(db, enviador):
    return ProspeccionService(db, enviador=enviador)


@pytest.fixture
def base(db):
    """Seis empresas: cuatro a las que se les puede escribir y dos que no."""
    ProspectoService(db).importar([
        {"ref_externa": "a", "nombre": "Constructora Sur", "segmento": "Constructoras y Desarrollo",
         "ciudad": "Bahía Blanca", "email": "compras@constructorasur.com.ar", "score": 90,
         "notas": "Tienen obra en White"},
        {"ref_externa": "b", "nombre": "Obras Norte", "segmento": "Constructoras y Desarrollo",
         "ciudad": "Punta Alta", "email": "info@obrasnorte.com.ar", "score": 80},
        {"ref_externa": "c", "nombre": "Montajes Bahía", "segmento": "Montajes y Mantenimiento Industrial",
         "ciudad": "Bahía Blanca", "email": "admin@montajesbahia.com.ar", "score": 70},
        {"ref_externa": "d", "nombre": "Hotel Austral", "segmento": "Hoteleria y Turismo",
         "ciudad": "Bahía Blanca", "email": "reservas@hotelaustral.com.ar", "score": 60},
        {"ref_externa": "e", "nombre": "Sin Mail SRL", "segmento": "Constructoras y Desarrollo",
         "ciudad": "Bahía Blanca", "telefono": "2914000001"},
        {"ref_externa": "f", "nombre": "Dio de baja SA", "segmento": "Constructoras y Desarrollo",
         "email": "x@baja.com.ar", "no_contactar": True},
    ])
    return {p.ref_externa: p for p in db.query(Prospecto).all()}


def _casilla(svc, nombre="franco", **kw):
    return svc.crear_casilla(f"{nombre}@empresas.ubicar-rent.com.ar", f"{nombre.title()} de Ubicar Rent",
                             ahora=LUNES, **kw)


def _campana(svc, base, *, enviar=True, seguimientos=True, refs="abcdef", ahora=LUNES, **kw):
    return svc.crear_campana_rapida(
        nombre="Constructoras · 23/11", ids=[base[r].id for r in refs], filtro=None,
        asunto=OBRA.asuntos[0], cuerpo=OBRA.cuerpo,
        seguimientos=[{"dias": s.dias, "cuerpo": s.cuerpo} for s in OBRA.seguimientos] if seguimientos else [],
        firma_nombre="Franco", firma_telefono="291 418-0554", usuario_id=None, enviar=enviar,
        ahora=ahora, **kw)


def _correr(svc, desde, vueltas=12, cada_min=5):
    """Varias vueltas del motor, como el scheduler: una cada tantos minutos."""
    total = 0
    for i in range(vueltas):
        total += svc.despachar(ahora=desde + timedelta(minutes=cada_min * i))["enviados"]
    return total


def _envios(db, **filtro):
    q = db.query(CampanaEnvio)
    for k, v in filtro.items():
        q = q.filter(getattr(CampanaEnvio, k) == v)
    return q.order_by(CampanaEnvio.id).all()


# ─── Casillas ────────────────────────────────────────────────────────────────

class TestCasillas:
    def test_desde_la_raiz_del_dominio_no_se_puede(self, svc):
        with pytest.raises(BusinessRuleError) as e:
            svc.crear_casilla("franco@ubicar-rent.com.ar", "Franco")
        assert "subdominio" in str(e.value) and "reputación" in str(e.value)

    def test_en_un_subdominio_queda_activa_y_arranca_la_rampa(self, svc):
        c = _casilla(svc)
        assert c.estado == "activa" and c.rampa_desde == date(2026, 11, 23)
        d = svc.casilla_dict(c, LUNES)
        assert (d["cupo_hoy"], d["enviados_hoy"], d["en_rampa"]) == (15, 0, True)

    def test_la_misma_casilla_dos_veces_no(self, svc):
        _casilla(svc)
        with pytest.raises(ConflictError):
            _casilla(svc)

    def test_sin_nombre_visible_o_con_un_responder_a_malo_se_rechaza(self, svc):
        with pytest.raises(BusinessRuleError):
            svc.crear_casilla("a@empresas.ubicar-rent.com.ar", "  ")
        with pytest.raises(BusinessRuleError):
            svc.crear_casilla("a@empresas.ubicar-rent.com.ar", "Franco", responder_a="no es un mail")

    def test_con_el_dominio_sin_verificar_queda_inactiva_con_el_motivo(self, db):
        falso = ResendDominiosFalso()
        svc = ProspeccionService(db, dominios=falso)
        c = _casilla(svc)
        assert c.estado == "inactiva" and "todavía no está creado" in c.motivo_estado
        svc.crear_dominio("empresas.ubicar-rent.com.ar")
        assert svc.revisar_casilla(c.id).estado == "inactiva"
        assert "no está verificado" in c.motivo_estado

    def test_verificar_ahora_activa_las_casillas_del_dominio(self, db):
        falso = ResendDominiosFalso()
        svc = ProspeccionService(db, dominios=falso)
        c = _casilla(svc)
        ficha = svc.crear_dominio("empresas.ubicar-rent.com.ar")
        assert falso.creados == [("empresas.ubicar-rent.com.ar", "sa-east-1")]
        assert [r["proposito"] for r in ficha["registros"]] == ["SPF", "SPF", "DKIM"]
        assert ficha["registros"][0]["nombre_completo"] == "send.empresas.ubicar-rent.com.ar"
        assert all(r["estado"] == "pendiente" for r in ficha["registros"])
        ficha = svc.verificar_dominio("empresas.ubicar-rent.com.ar", ahora=LUNES)
        assert ficha["estado"] == "verificado" and c.estado == "activa" and c.motivo_estado is None

    def test_crear_el_dominio_dos_veces_no_lo_duplica(self, db):
        falso = ResendDominiosFalso()
        svc = ProspeccionService(db, dominios=falso)
        svc.crear_dominio("empresas.ubicar-rent.com.ar")
        svc.crear_dominio("empresas.ubicar-rent.com.ar")
        assert len(falso.creados) == 1

    def test_no_se_puede_crear_la_raiz_ni_un_dominio_ajeno(self, svc):
        for malo in ("ubicar-rent.com.ar", "empresas.otra.com.ar"):
            with pytest.raises(BusinessRuleError):
                svc.crear_dominio(malo)

    def test_el_checklist_trae_cada_registro_y_la_recomendacion_de_dmarc(self, db):
        falso = ResendDominiosFalso()
        svc = ProspeccionService(db, dominios=falso)
        _casilla(svc)
        svc.crear_dominio("empresas.ubicar-rent.com.ar")
        d = svc.dominios()
        assert d["modo"] == "api" and d["raiz"] == "ubicar-rent.com.ar"
        ficha = d["dominios"][0]
        assert ficha["dominio"] == "empresas.ubicar-rent.com.ar" and len(ficha["registros"]) == 3
        assert ficha["dmarc"]["nombre_completo"] == "_dmarc.empresas.ubicar-rent.com.ar"
        assert ficha["dmarc"]["valor"].startswith("v=DMARC1; p=none; rua=mailto:")

    def test_con_una_key_de_solo_envio_muestra_los_pasos_a_mano_sin_romper(self, db):
        svc = ProspeccionService(db, dominios=ResendDominiosFalso(sin_permiso=True))
        c = _casilla(svc)
        assert c.estado == "inactiva" and "No se pudo comprobar" in c.motivo_estado
        d = svc.dominios()
        assert d["modo"] == "manual" and "Pedile a Gael" in d["aviso"]
        registros = d["dominios"][0]["registros"]
        assert [(r["tipo"], r["nombre"]) for r in registros] == [
            ("MX", "send.empresas"), ("TXT", "send.empresas"), ("TXT", "resend._domainkey.empresas")]
        assert all(r["estado"] == "sin_comprobar" for r in registros)
        # Crear el dominio tampoco rompe: devuelve la misma ficha manual.
        assert svc.crear_dominio("empresas.ubicar-rent.com.ar")["modo"] == "manual"
        # Y se puede activar a mano, con el "ya está verificado".
        assert svc.revisar_casilla(c.id, confirmo=True).estado == "activa"

    def test_confirmar_a_mano_no_le_gana_a_resend_diciendo_que_no(self, db):
        svc = ProspeccionService(db, dominios=ResendDominiosFalso())
        c = _casilla(svc)
        assert svc.revisar_casilla(c.id, confirmo=True).estado == "inactiva"

    def test_pausar_y_reactivar_reinicia_la_salud(self, svc):
        c = _casilla(svc)
        svc.pausar_casilla(c.id)
        assert c.estado == "pausada" and c.motivo_estado == "Pausada a mano."
        despues = LUNES + timedelta(days=3)
        svc.reactivar_casilla(c.id, ahora=despues)
        assert c.estado == "activa" and c.salud_desde == despues and c.motivo_estado is None
        assert c.rampa_desde == date(2026, 11, 23), "la rampa no vuelve a empezar"


# ─── Quiénes y mensaje ───────────────────────────────────────────────────────

class TestAudienciaYVistaPrevia:
    def test_las_audiencias_traen_el_numero_ya_calculado(self, svc, base):
        a = svc.audiencias(ahora=LUNES)
        assert a["todos"] == 4 and a["nunca_contactados"] == 4
        assert a["segmentos"][0] == {"segmento": "Constructoras y Desarrollo", "cantidad": 2}
        assert {"ciudad": "Bahía Blanca", "cantidad": 3} in a["ciudades"]
        assert a["no_se_les_escribe"] == {"no tiene mail": 1, "pidió que no lo contacten": 1}

    def test_calcular_dice_a_cuantos_sale_y_a_cuantos_no(self, svc, base):
        r = svc.calcular([p.id for p in base.values()], asunto=OBRA.asuntos[0], cuerpo=OBRA.cuerpo,
                         seguimientos=[], firma_nombre="Franco", firma_telefono=None, ahora=LUNES)
        assert (r["total"], r["salen"]) == (6, 4)
        assert r["no_salen"] == {"no tiene mail": 1, "pidió que no lo contacten": 1}
        assert r["plantilla_sugerida"] == "obra"

    def test_la_vista_previa_es_con_una_empresa_real_y_se_puede_pasar_a_otra(self, svc, base):
        ids = [p.id for p in base.values()]
        kw = dict(asunto=OBRA.asuntos[0], cuerpo=OBRA.cuerpo, seguimientos=[], firma_nombre="Franco",
                  firma_telefono="291 418-0554", ahora=LUNES)
        m = svc.calcular(ids, indice=0, **kw)["muestra"]
        assert m["prospecto"]["nombre"] == "Constructora Sur" and m["de"] == 4
        assert "Hola, equipo de Constructora Sur:" in m["cuerpo"]
        assert url_de_baja(base["a"].id) in m["cuerpo"] and m["avisos"] == [] and m["faltantes"] == []
        assert m["prospecto"]["notas"] == "Tienen obra en White"
        assert "Tienen obra en White" not in m["cuerpo"], "la nota es interna: nunca va en el mail"
        assert svc.calcular(ids, indice=1, **kw)["muestra"]["prospecto"]["nombre"] == "Obras Norte"
        assert svc.calcular(ids, indice=4, **kw)["muestra"]["indice"] == 0, "da la vuelta"

    def test_la_vista_previa_marca_lo_que_falto(self, svc, base):
        m = svc.calcular([base["a"].id], asunto="Hola {{empresa}}", cuerpo=OBRA.cuerpo, seguimientos=[],
                         firma_nombre=None, firma_telefono=None, ahora=LUNES)["muestra"]
        assert m["faltantes"] == ["firma_nombre"]
        assert "\nWhatsApp " not in m["cuerpo"], "el renglón del teléfono se cayó entero"

    def test_un_mensaje_con_problemas_trae_los_avisos(self, svc, base):
        m = svc.calcular([base["a"].id], asunto="OFERTA IMPERDIBLE!!!", cuerpo="Hola {{emrpesa}}",
                         seguimientos=[], firma_nombre="F", firma_telefono=None, ahora=LUNES)["muestra"]
        textos = " ".join(a["texto"] for a in m["avisos"] if a["grave"])
        assert "{{emrpesa}}" in textos and "spam" in textos
        assert "Para no recibir más mails" in m["cuerpo"], "el pie de baja se agrega solo"

    def test_el_nombre_se_propone_solo(self, svc, base):
        kw = dict(asunto=None, cuerpo=None, seguimientos=[], firma_nombre=None, firma_telefono=None, ahora=LUNES)
        assert svc.calcular([base["a"].id, base["b"].id], **kw)["nombre_sugerido"] == "Constructoras · 23/11"
        assert svc.calcular([base["a"].id, base["d"].id], **kw)["nombre_sugerido"] == "Varios rubros · 23/11"

    def test_el_resumen_dice_cuando_termina(self, svc, base):
        _casilla(svc, "franco")
        _casilla(svc, "martin")
        p = svc.plan(60, ahora=LUNES)
        assert p["listo"] and p["casillas_activas"] == 2 and p["simulado"]
        assert (p["por_dia"], p["dias"], p["termina_texto"]) == (30, 2, "el martes 24/11")

    def test_sin_casilla_el_plan_dice_por_que_no_se_puede(self, svc):
        p = svc.plan(60, ahora=LUNES)
        assert not p["listo"] and "ninguna casilla" in p["motivo"] and p["termina"] is None


# ─── Campaña rápida y motor ──────────────────────────────────────────────────

class TestCampanaRapida:
    def test_sin_casilla_enviar_se_niega_pero_guardarla_funciona(self, db, svc, base):
        with pytest.raises(BusinessRuleError) as e:
            _campana(svc, base)
        assert "sin_casilla" in str(e.value)
        c = _campana(svc, base, enviar=False)
        assert c.estado == "lista" and _envios(db) == []
        assert svc.despachar(ahora=LUNES)["motivo"] == "sin casillas activas"
        # Cuando hay casilla, la misma campaña sale con un clic.
        _casilla(svc)
        assert svc.lanzar(c.id, ahora=LUNES).estado == "enviando"
        assert len(_envios(db, estado="en_cola")) == 4

    def test_deja_en_cola_un_mail_por_empresa_con_el_texto_ya_armado(self, db, svc, base):
        _casilla(svc)
        c = _campana(svc, base)
        assert c.estado == "enviando" and c.lanzada_at == LUNES
        envios = _envios(db)
        assert [e.para for e in envios] == [
            "compras@constructorasur.com.ar", "info@obrasnorte.com.ar",
            "admin@montajesbahia.com.ar", "reservas@hotelaustral.com.ar"]
        e = envios[0]
        assert e.estado == "en_cola" and e.toque == 1 and e.asunto == "Camionetas para obra en Bahía Blanca"
        assert "Hola, equipo de Constructora Sur:" in e.cuerpo and "{{" not in e.cuerpo
        assert e.cuerpo.endswith(url_de_baja(base["a"].id))
        omitidos = {d.prospecto.nombre: d.motivo for d in
                    db.query(CampanaDestinatario).filter_by(estado="omitido").all()}
        assert omitidos == {"Sin Mail SRL": "no tiene mail", "Dio de baja SA": "pidió que no lo contacten"}

    def test_un_mensaje_con_una_variable_mal_escrita_no_se_crea(self, db, svc, base):
        _casilla(svc)
        with pytest.raises(BusinessRuleError) as e:
            svc.crear_campana_rapida(
                nombre="X", ids=[base["a"].id], filtro=None, asunto="Hola", cuerpo="Hola {{emrpesa}}",
                seguimientos=[], firma_nombre="F", firma_telefono=None, usuario_id=None, enviar=True,
                ahora=LUNES)
        assert "{{emrpesa}}" in str(e.value) and db.query(CampanaProspecto).count() == 0

    def test_si_alguien_borro_el_pie_de_baja_vuelve_solo(self, db, svc, base):
        _casilla(svc)
        svc.crear_campana_rapida(
            nombre="X", ids=[base["a"].id], filtro=None, asunto="Camionetas",
            cuerpo="Hola, equipo de {{empresa}}: ¿les sirve una camioneta?", seguimientos=[],
            firma_nombre="F", firma_telefono=None, usuario_id=None, enviar=True, ahora=LUNES)
        assert url_de_baja(base["a"].id) in _envios(db)[0].cuerpo

    def test_quien_recibio_una_campana_hace_menos_de_30_dias_no_entra_en_otra(self, db, svc, base):
        _casilla(svc)
        primera = _campana(svc, base, refs="a", seguimientos=False)
        assert _correr(svc, LUNES, vueltas=1) == 1
        svc.despachar(ahora=LUNES + timedelta(minutes=5))
        assert primera.estado == "terminada"
        a_los_10 = LUNES + timedelta(days=10)
        r = svc.calcular([base["a"].id, base["b"].id], asunto=None, cuerpo=None, seguimientos=[],
                         firma_nombre=None, firma_telefono=None, ahora=a_los_10)
        assert r["salen"] == 1 and r["no_salen"] == {"recibió un mail nuestro en los últimos 30 días": 1}
        a_los_31 = LUNES + timedelta(days=31)
        assert svc.calcular([base["a"].id], asunto=None, cuerpo=None, seguimientos=[], firma_nombre=None,
                            firma_telefono=None, ahora=a_los_31)["salen"] == 1

    def test_la_misma_empresa_no_entra_en_dos_campanas_a_la_vez(self, db, svc, base):
        _casilla(svc)
        _campana(svc, base, refs="ab")
        segunda = _campana(svc, base, refs="abc")
        assert [e.prospecto.nombre for e in _envios(db, campana_id=segunda.id)] == ["Montajes Bahía"]

    def test_dos_empresas_con_el_mismo_mail_reciben_uno_solo(self, db, svc, base):
        base["b"].email = "COMPRAS@constructorasur.com.ar"
        db.flush()
        _casilla(svc)
        c = _campana(svc, base, refs="ab")
        assert len(_envios(db, campana_id=c.id)) == 1
        assert db.query(CampanaDestinatario).filter_by(estado="omitido").one().motivo == \
            "mismo mail que otra empresa de la lista"

    def test_una_campana_armada_con_el_camino_viejo_tambien_se_puede_lanzar(self, db, svc, base):
        viejo = ProspectoService(db)
        c = viejo.crear_campana("Vieja", [base["a"].id, base["e"].id], None, None)
        viejo.actualizar_mensaje(c.id, "Camionetas para obra", "Hola, equipo de {{empresa}}: ¿hablamos?")
        _casilla(svc)
        svc.lanzar(c.id, ahora=LUNES)
        envios = _envios(db, campana_id=c.id)
        assert len(envios) == 1 and url_de_baja(base["a"].id) in envios[0].cuerpo
        # La que sólo tenía teléfono estaba "pendiente" para el camino viejo: por mail no sale.
        assert db.query(CampanaDestinatario).filter_by(prospecto_id=base["e"].id).one().motivo == "no tiene mail"


class TestMotor:
    def test_fuera_del_horario_no_sale_nada_y_la_cola_espera(self, db, svc, base):
        _casilla(svc)
        _campana(svc, base)
        for cuando in (SABADO, datetime(2026, 11, 23, 11, 0), datetime(2026, 11, 23, 17, 0),
                       datetime(2026, 11, 23, 22, 0)):   # sábado, 8:00, 14:00 (siesta) y 19:00
            r = svc.despachar(ahora=cuando)
            assert r["enviados"] == 0 and r["motivo"] == "fuera de horario"
        assert len(_envios(db, estado="en_cola")) == 4

    def test_manda_de_a_uno_por_casilla_y_espaciado(self, db, svc, enviador, base):
        _casilla(svc)
        _campana(svc, base, seguimientos=False)
        assert svc.despachar(ahora=LUNES)["enviados"] == 1
        # La misma casilla no vuelve a mandar al instante…
        assert svc.despachar(ahora=LUNES + timedelta(seconds=30))["enviados"] == 0
        casilla = db.query(CasillaProspeccion).one()
        espera = (casilla.proximo_envio_at - LUNES).total_seconds()
        assert reglas.ESPACIADO_MIN_S <= espera <= reglas.ESPACIADO_MAX_S
        # …pero sí cuando pasó su espaciado.
        assert svc.despachar(ahora=LUNES + timedelta(seconds=241))["enviados"] == 1
        assert len(enviador.enviados) == 2

    def test_el_mail_sale_con_remitente_responder_a_y_cabeceras_de_baja(self, db, svc, enviador, base):
        _casilla(svc, responder_a="ventas@ubicar-rent.com.ar")
        _campana(svc, base, refs="a")
        svc.despachar(ahora=LUNES)
        m = enviador.enviados[0]
        assert m.desde == "Franco de Ubicar Rent <franco@empresas.ubicar-rent.com.ar>"
        assert m.responder_a == "ventas@ubicar-rent.com.ar" and m.para == "compras@constructorasur.com.ar"
        baja = url_de_baja(base["a"].id)
        assert m.cabeceras["List-Unsubscribe"] == f"<{baja}>, <mailto:ventas@ubicar-rent.com.ar?subject=baja>"
        assert m.cabeceras["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
        assert m.texto == _envios(db)[0].cuerpo
        assert f'<a href="{baja}">' in m.html and "<img" not in m.html and "<br>" in m.html
        assert m.clave_idempotencia == f"ubicar-prospeccion-{_envios(db)[0].id}"

    def test_al_salir_el_primer_mail_la_empresa_pasa_a_contactada(self, db, svc, base):
        _casilla(svc)
        c = _campana(svc, base, refs="a")
        svc.despachar(ahora=LUNES)
        e = _envios(db, toque=1)[0]
        assert (e.estado, e.enviado_at, e.desde, e.simulado) == (
            "enviado", LUNES, "franco@empresas.ubicar-rent.com.ar", True)
        assert base["a"].estado == "contactado"
        d = db.query(CampanaDestinatario).filter_by(campana_id=c.id, prospecto_id=base["a"].id).one()
        assert d.estado == "enviado" and d.enviado_at == LUNES

    def test_reparte_parejo_entre_las_casillas(self, db, svc, base):
        _casilla(svc, "franco")
        _casilla(svc, "martin")
        _campana(svc, base, seguimientos=False)
        assert svc.despachar(ahora=LUNES)["enviados"] == 2, "una por casilla en la misma vuelta"
        assert _correr(svc, LUNES + timedelta(minutes=5)) == 2
        por_casilla = {}
        for e in _envios(db):
            por_casilla[e.desde] = por_casilla.get(e.desde, 0) + 1
        assert por_casilla == {"franco@empresas.ubicar-rent.com.ar": 2, "martin@empresas.ubicar-rent.com.ar": 2}

    def test_respeta_el_cupo_de_la_rampa_y_sigue_al_dia_siguiente(self, db, svc, base):
        c = _casilla(svc, limite_dia=2)
        _campana(svc, base, seguimientos=False)
        assert _correr(svc, LUNES) == 2
        assert len(_envios(db, estado="en_cola")) == 2
        assert svc.casilla_dict(c, LUNES + timedelta(hours=1))["enviados_hoy"] == 2
        assert _correr(svc, LUNES + timedelta(days=1)) == 2

    def test_respeta_el_tope_diario_global(self, db, svc, base, monkeypatch):
        monkeypatch.setattr(settings, "prospeccion_tope_diario", 3)
        _casilla(svc, "franco")
        _casilla(svc, "martin")
        _campana(svc, base, seguimientos=False)
        assert _correr(svc, LUNES) == 3
        assert svc.despachar(ahora=LUNES + timedelta(hours=2))["motivo"] == "se llegó al tope del día"

    def test_al_momento_de_mandar_vuelve_a_mirar_si_se_le_puede_escribir(self, db, svc, enviador, base):
        _casilla(svc)
        c = _campana(svc, base, refs="ab", seguimientos=False)
        base["a"].no_contactar = True
        db.flush()
        r = svc.despachar(ahora=LUNES)
        assert (r["enviados"], r["omitidos"]) == (1, 1), "saltea al que no y manda el siguiente"
        e = _envios(db, prospecto_id=base["a"].id)[0]
        assert (e.estado, e.motivo) == ("omitido", "pidió que no lo contacten")
        assert [m.para for m in enviador.enviados] == ["info@obrasnorte.com.ar"]
        d = db.query(CampanaDestinatario).filter_by(campana_id=c.id, prospecto_id=base["a"].id).one()
        assert d.estado == "omitido"

    def test_un_envio_tomado_no_sale_dos_veces_aunque_el_motor_se_pise(self, db, svc, enviador, base):
        """El contenedor se reinició justo después de tomar la fila: quedó en `enviando`."""
        _casilla(svc)
        _campana(svc, base, refs="a", seguimientos=False)
        e = _envios(db)[0]
        e.estado, e.tomado_at = "enviando", LUNES
        db.commit()
        assert svc.despachar(ahora=LUNES + timedelta(minutes=5))["enviados"] == 0
        assert enviador.enviados == [], "otra corrida no agarra lo que ya está tomado"
        # A los 15 minutos se da por huérfano y vuelve a la cola, con la misma
        # clave de idempotencia: si Resend ya lo había aceptado, no lo repite.
        assert svc.despachar(ahora=LUNES + timedelta(minutes=16))["enviados"] == 1
        assert enviador.enviados[0].clave_idempotencia == f"ubicar-prospeccion-{e.id}"

    def test_con_la_campana_pausada_no_sale_y_al_reanudar_sigue(self, db, svc, base):
        _casilla(svc)
        c = _campana(svc, base, seguimientos=False)
        svc.pausar_campana(c.id)
        assert svc.despachar(ahora=LUNES)["enviados"] == 0
        svc.reanudar_campana(c.id)
        assert svc.despachar(ahora=LUNES)["enviados"] == 1

    def test_cancelar_saca_de_la_cola_lo_que_no_salio(self, db, svc, base):
        _casilla(svc)
        c = _campana(svc, base, seguimientos=False)
        svc.despachar(ahora=LUNES)
        svc.cancelar_campana(c.id)
        assert c.estado == "cancelada"
        assert sorted(e.estado for e in _envios(db)) == ["cancelado"] * 3 + ["enviado"]
        assert _correr(svc, LUNES + timedelta(minutes=10)) == 0
        with pytest.raises(BusinessRuleError):
            svc.cancelar_campana(c.id)

    def test_si_resend_falla_un_rato_se_reintenta_y_si_no_queda_con_error(self, db, base):
        caido = EnviadorSimulado(falla_con=ResultadoProspeccion(False, error="Resend 503", transitorio=True))
        svc = ProspeccionService(db, enviador=caido)
        _casilla(svc)
        _campana(svc, base, refs="a", seguimientos=False)
        assert svc.despachar(ahora=LUNES)["errores"] == 1
        e = _envios(db)[0]
        assert e.estado == "en_cola" and e.programado_para == LUNES + timedelta(minutes=30)
        svc.despachar(ahora=LUNES + timedelta(minutes=31))
        svc.despachar(ahora=LUNES + timedelta(minutes=62))
        assert (e.estado, e.motivo, e.intentos) == ("error", "Resend 503", 3)
        assert base["a"].estado == "nuevo", "si no salió, no está contactada"

    def test_si_resend_dice_que_el_dominio_no_esta_verificado_se_apaga_la_casilla(self, db, base):
        rechazo = EnviadorSimulado(falla_con=ResultadoProspeccion(
            False, error="Resend 403: The empresas.ubicar-rent.com.ar domain is not verified."))
        svc = ProspeccionService(db, enviador=rechazo)
        c = _casilla(svc)
        _campana(svc, base, refs="a", seguimientos=False)
        svc.despachar(ahora=LUNES)
        assert c.estado == "inactiva" and "not verified" in c.motivo_estado
        assert _envios(db)[0].estado == "en_cola", "el mail no tiene la culpa: espera"

    def test_con_lista_blanca_solo_sale_de_verdad_a_esas_direcciones(self, db, svc, enviador, base, monkeypatch):
        monkeypatch.setattr(settings, "prospeccion_solo_a", "info@obrasnorte.com.ar, gael@solven.com.ar")
        _casilla(svc)
        _campana(svc, base, refs="ab", seguimientos=False)
        _correr(svc, LUNES)
        assert [m.para for m in enviador.enviados] == ["info@obrasnorte.com.ar"]
        simulado = _envios(db, prospecto_id=base["a"].id)[0]
        assert simulado.estado == "enviado" and simulado.simulado, "queda registrado, pero no salió"

    def test_cuando_no_queda_nada_por_salir_la_campana_termina(self, db, svc, base):
        _casilla(svc)
        c = _campana(svc, base, refs="ab", seguimientos=False)
        _correr(svc, LUNES)
        assert c.estado == "terminada"
        assert svc.progreso(c.id)["enviados"] == 2


# ─── Seguimientos ────────────────────────────────────────────────────────────

class TestSeguimientos:
    def _primer_mail(self, db, svc, base, refs="a"):
        _casilla(svc)
        c = _campana(svc, base, refs=refs)
        _correr(svc, LUNES, vueltas=len(refs) * 2)
        return c

    def test_el_segundo_toque_se_programa_solo_a_los_5_dias(self, db, svc, base):
        c = self._primer_mail(db, svc, base)
        segundo = _envios(db, toque=2)[0]
        assert segundo.estado == "en_cola" and segundo.programado_para == LUNES + timedelta(days=5)
        assert segundo.asunto == "Re: Camionetas para obra en Bahía Blanca"
        assert "Se lo reenvío por si quedó entre otros mails" in segundo.cuerpo
        assert "> Hola, equipo de Constructora Sur:" in segundo.cuerpo, "lleva citado el primero"
        assert segundo.cuerpo.endswith(url_de_baja(base["a"].id)) and segundo.cuerpo.count("--\n") == 1
        assert c.estado == "enviando", "con un seguimiento por salir la campaña sigue abierta"

    def test_los_tres_toques_salen_en_orden_y_por_la_misma_casilla(self, db, svc, enviador, base):
        _casilla(svc, "martin")
        c = self._primer_mail(db, svc, base)
        casilla = _envios(db, toque=1)[0].desde
        assert _correr(svc, LUNES + timedelta(days=4)) == 0, "todavía no le toca"
        # +5 días es sábado: sale el lunes siguiente.
        assert _correr(svc, LUNES + timedelta(days=5)) == 0
        assert _correr(svc, LUNES + timedelta(days=7)) == 1
        assert _correr(svc, LUNES + timedelta(days=11)) == 0
        assert _correr(svc, LUNES + timedelta(days=14)) == 1
        toques = _envios(db)
        assert [(e.toque, e.estado, e.desde) for e in toques] == [
            (1, "enviado", casilla), (2, "enviado", casilla), (3, "enviado", casilla)]
        assert "no queremos ocuparles la casilla" in toques[2].cuerpo
        assert toques[2].programado_para == LUNES + timedelta(days=12)
        assert c.estado == "terminada" and len(enviador.enviados) == 3
        assert svc.progreso(c.id) == {
            "en_cola": 0, "enviados": 3, "entregados": 0, "rebotes": 0, "quejas": 0, "respuestas": 0,
            "bajas": 0, "empresas_contactadas": 1, "simulados": 3, "errores": 0}

    def test_marcar_que_respondio_corta_la_secuencia(self, db, svc, base):
        c = self._primer_mail(db, svc, base)
        assert svc.marcar_respondio(base["a"].id, ahora=LUNES + timedelta(days=1))
        assert base["a"].estado == "respondio"
        primero, segundo = _envios(db)
        assert primero.estado == "respondio" and primero.respondio_at is not None
        assert (segundo.estado, segundo.motivo) == ("cancelado", "la empresa respondió")
        assert _correr(svc, LUNES + timedelta(days=7)) == 0
        assert svc.progreso(c.id)["respuestas"] == 1 and c.estado == "terminada"

    def test_si_lo_marcan_respondio_desde_la_tabla_tampoco_sale(self, db, svc, base):
        self._primer_mail(db, svc, base)
        ProspectoService(db).cambiar_estado([base["a"].id], "respondio")
        assert _correr(svc, LUNES + timedelta(days=7)) == 0
        assert _envios(db, toque=2)[0].estado == "cancelado"

    def test_sin_seguimientos_la_campana_es_de_un_solo_mail(self, db, svc, base):
        _casilla(svc)
        _campana(svc, base, refs="a", seguimientos=False)
        _correr(svc, LUNES)
        assert len(_envios(db)) == 1


# ─── Lo que vuelve: webhook, rebotes, quejas, bajas ──────────────────────────

class TestEventos:
    def _enviado(self, db, svc, base, refs="a"):
        _casilla(svc)
        c = _campana(svc, base, refs=refs)
        _correr(svc, LUNES, vueltas=len(refs) * 2)
        return c, {e.prospecto.ref_externa: e for e in _envios(db, toque=1)}

    def test_entregado_se_anota_una_sola_vez(self, db, svc, base):
        c, e = self._enviado(db, svc, base)
        datos = {"email_id": e["a"].proveedor_id}
        assert svc.registrar_evento("email.delivered", datos, ahora=LUNES) == "entregado"
        assert svc.registrar_evento("email.delivered", datos, ahora=LUNES) == "repetido"
        assert e["a"].estado == "entregado" and svc.progreso(c.id)["entregados"] == 1

    def test_un_evento_de_un_mail_que_no_es_de_campana_se_ignora(self, svc):
        assert svc.registrar_evento("email.delivered", {"email_id": "el-de-una-reserva"}) == "ajeno"
        assert svc.registrar_evento("email.opened", {"email_id": "x"}) == "ignorado"
        assert svc.registrar_evento("email.bounced", {}) == "ajeno"

    def test_un_rebote_duro_deja_a_la_empresa_como_no_contactar(self, db, svc, base):
        c, e = self._enviado(db, svc, base)
        datos = {"email_id": e["a"].proveedor_id,
                 "bounce": {"type": "Permanent", "message": "La casilla no existe"}}
        assert svc.registrar_evento("email.bounced", datos, ahora=LUNES) == "rebote"
        assert svc.registrar_evento("email.bounced", datos, ahora=LUNES) == "repetido"
        p = base["a"]
        assert (p.no_contactar, p.no_contactar_motivo, p.estado) == (True, "rebote", "no_contactar")
        assert (e["a"].estado, e["a"].rebote_duro, e["a"].motivo) == ("rebotado", True, "La casilla no existe")
        assert _envios(db, toque=2)[0].estado == "cancelado"
        assert svc.progreso(c.id)["rebotes"] == 1

    def test_un_rebote_blando_no_da_de_baja_pero_corta_el_seguimiento(self, db, svc, base):
        _c, e = self._enviado(db, svc, base)
        svc.registrar_evento("email.bounced", {"email_id": e["a"].proveedor_id,
                                               "bounce": {"type": "Transient"}}, ahora=LUNES)
        assert not base["a"].no_contactar and e["a"].rebote_duro is False
        assert _envios(db, toque=2)[0].estado == "cancelado"
        assert db.query(CasillaProspeccion).one().estado == "activa"

    def test_tres_rebotes_pausan_la_casilla_y_las_campanas_esperan(self, db, svc, base):
        c, e = self._enviado(db, svc, base, refs="abcd")
        for ref in "abc":
            svc.registrar_evento("email.bounced", {"email_id": e[ref].proveedor_id}, ahora=LUNES)
        casilla = db.query(CasillaProspeccion).one()
        assert casilla.estado == "pausada"
        assert casilla.motivo_estado == "Freno automático: 3 rebotes en 4 envíos."
        # Queda el seguimiento de la cuarta: no falla, espera.
        r = svc.despachar(ahora=LUNES + timedelta(days=7))
        assert r["enviados"] == 0 and r["motivo"] == "sin casillas activas"
        assert c.estado == "enviando" and _envios(db, toque=2, estado="en_cola")
        # Al reactivarla sale, y los rebotes viejos no la vuelven a pausar.
        svc.reactivar_casilla(casilla.id, ahora=LUNES + timedelta(days=7))
        assert svc.despachar(ahora=LUNES + timedelta(days=7))["enviados"] == 1
        assert svc.evaluar_freno(casilla.id) is None and casilla.estado == "activa"

    def test_una_queja_de_spam_pausa_la_casilla_y_da_de_baja_a_la_empresa(self, db, svc, base):
        c, e = self._enviado(db, svc, base, refs="ab")
        assert svc.registrar_evento("email.complained", {"email_id": e["a"].proveedor_id}, ahora=LUNES) == "queja"
        casilla = db.query(CasillaProspeccion).one()
        assert casilla.estado == "pausada" and "1 queja de spam" in casilla.motivo_estado
        assert base["a"].no_contactar and base["a"].no_contactar_motivo == "queja de spam"
        assert svc.progreso(c.id)["quejas"] == 1
        assert svc.resumen(ahora=LUNES)["bajas"] == 1

    def test_una_respuesta_por_mail_marca_respondio(self, db, svc, base):
        _c, e = self._enviado(db, svc, base)
        datos = {"email_id": "in_1", "from": "Compras <Compras@constructorasur.com.ar>",
                 "subject": "Re: Camionetas para obra en Bahía Blanca"}
        cuerpo = lambda _id: {"text": "Hola, nos interesa. ¿Tienen dos camionetas para enero?"}
        assert svc.registrar_evento("email.received", datos, ahora=LUNES, traer_recibido=cuerpo) == "respuesta"
        assert base["a"].estado == "respondio" and not base["a"].no_contactar
        assert svc.registrar_evento("email.received", datos, ahora=LUNES, traer_recibido=cuerpo) == "repetido"

    def test_un_fuera_de_oficina_no_es_una_respuesta(self, db, svc, base):
        self._enviado(db, svc, base)
        datos = {"email_id": "in_2", "from": "compras@constructorasur.com.ar",
                 "subject": "Respuesta automática: vuelvo el lunes"}
        assert svc.registrar_evento("email.received", datos, ahora=LUNES) == "ignorado"
        assert base["a"].estado == "contactado" and _envios(db, toque=2)[0].estado == "en_cola"

    def test_si_contestan_no_quedan_dados_de_baja(self, db, svc, base):
        self._enviado(db, svc, base)
        datos = {"email_id": "in_3", "from": "compras@constructorasur.com.ar", "subject": "Re: Camionetas"}
        svc.registrar_evento("email.received", datos, ahora=LUNES, traer_recibido=lambda _id: {"text": "No."})
        assert base["a"].no_contactar and base["a"].no_contactar_motivo == "pidió la baja por mail"

    def test_la_baja_es_para_siempre_y_cancela_lo_que_estaba_en_cola(self, db, svc, base):
        c, e = self._enviado(db, svc, base)
        assert svc.dar_de_baja(base["a"].id) is True
        assert svc.dar_de_baja(base["a"].id) is False, "la segunda vez no cambia nada"
        assert (base["a"].no_contactar, base["a"].no_contactar_motivo) == (True, "baja")
        assert e["a"].estado == "baja" and _envios(db, toque=2)[0].estado == "cancelado"
        assert svc.progreso(c.id)["bajas"] == 1
        # Ni importándola de nuevo, ni cambiándole el estado a mano, vuelve.
        ProspectoService(db).importar([{"ref_externa": "a", "nombre": "Constructora Sur", "no_contactar": False}])
        assert ProspectoService(db).cambiar_estado([base["a"].id], "nuevo") == 0
        assert svc.audiencias(ahora=LUNES + timedelta(days=60))["todos"] == 3

    def test_el_resumen_de_arriba(self, db, svc, base):
        _c, e = self._enviado(db, svc, base, refs="ab")
        svc.marcar_respondio(base["b"].id, ahora=LUNES)
        r = svc.resumen(ahora=LUNES + timedelta(hours=1))
        assert (r["enviados_semana"], r["respuestas"], r["bajas"]) == (2, 1, 0)
        assert r["contactables"] == 2, "las dos que ya recibieron no cuentan por 30 días"
        assert svc.resumen(ahora=LUNES + timedelta(days=7))["enviados_semana"] == 0


class TestPrueba:
    def test_me_llega_tal_cual_y_no_cuenta_para_nada(self, db, svc, enviador, base):
        _casilla(svc)
        r = svc.enviar_prueba("gael@solven.com.ar", asunto=OBRA.asuntos[0], cuerpo=OBRA.cuerpo,
                              firma_nombre="Franco", firma_telefono=None, prospecto_id=base["a"].id, ahora=LUNES)
        assert r == {"para": "gael@solven.com.ar", "simulado": True,
                     "desde": "Franco de Ubicar Rent <franco@empresas.ubicar-rent.com.ar>"}
        m = enviador.enviados[0]
        assert "Hola, equipo de Constructora Sur:" in m.texto
        assert "/public/baja/prueba" in m.texto, "el link de la prueba no da de baja a nadie"
        assert _envios(db) == [] and base["a"].estado == "nuevo"

    def test_un_mensaje_que_no_pasa_la_compuerta_no_se_manda_ni_de_prueba(self, svc, enviador):
        with pytest.raises(BusinessRuleError):
            svc.enviar_prueba("gael@solven.com.ar", asunto="GRATIS!!!", cuerpo="Hola", firma_nombre="F",
                              firma_telefono=None)
        assert enviador.enviados == []


# ─── Endpoints ───────────────────────────────────────────────────────────────

def _firmado(secreto: str, evento: dict) -> tuple[bytes, dict]:
    cuerpo = json.dumps(evento).encode()
    ts = str(int(_time.time()))
    return cuerpo, {"svix-id": "msg_1", "svix-timestamp": ts, "content-type": "application/json",
                    "svix-signature": reglas.firmar_svix(secreto, "msg_1", ts, cuerpo)}


class TestEndpoints:
    SECRETO = "whsec_" + base64.b64encode(b"secreto de prueba del webhook").decode()

    @pytest.mark.parametrize("ruta", ["/prospectos/plantillas", "/prospectos/panel", "/prospectos/audiencias",
                                      "/prospectos/casillas", "/prospectos/campanas", "/prospectos/resumen"])
    def test_lo_que_pide_la_pantalla_al_abrir_responde(self, client, base, ruta):
        assert client.get(f"{API}{ruta}").status_code == 200

    def test_las_plantillas_llegan_con_variables_y_firma(self, client):
        d = client.get(f"{API}/prospectos/plantillas").json()["data"]
        assert len(d["plantillas"]) == 6 and d["firma"]["nombre"] == "Operador"
        assert {v["nombre"] for v in d["variables"]} >= {"empresa", "baja"}

    def test_el_alta_de_una_casilla_en_la_raiz_explica_por_que_no(self, client):
        r = client.post(f"{API}/prospectos/casillas", json={
            "direccion": "franco@ubicar-rent.com.ar", "nombre_visible": "Franco"})
        assert r.status_code == 422 and "subdominio" in r.json()["detail"]

    def test_la_campana_rapida_de_punta_a_punta_por_http(self, client, db, base):
        r = client.post(f"{API}/prospectos/casillas", json={
            "direccion": "franco@empresas.ubicar-rent.com.ar", "nombre_visible": "Franco de Ubicar Rent"})
        assert r.status_code == 201 and r.json()["data"]["estado"] == "activa"
        cuerpo = {"filtro": {"segmento": "Constructoras y Desarrollo"}, "asunto": OBRA.asuntos[0],
                  "cuerpo": OBRA.cuerpo, "firma_nombre": "Franco",
                  "seguimientos": [{"dias": 5, "cuerpo": OBRA.seguimientos[0].cuerpo}]}
        calc = client.post(f"{API}/prospectos/campanas/calcular", json=cuerpo).json()["data"]
        assert (calc["total"], calc["salen"]) == (4, 2) and calc["plan"]["listo"]
        assert calc["muestra"]["seguimientos"][0]["asunto"].startswith("Re: ")
        r = client.post(f"{API}/prospectos/campanas/rapida", json={**cuerpo, "nombre": calc["nombre_sugerido"]})
        assert r.status_code == 201
        campana = r.json()["data"]
        assert campana["estado"] == "enviando" and campana["progreso"]["en_cola"] == 2
        detalle = client.get(f"{API}/prospectos/campanas/{campana['id']}").json()["data"]
        assert len(detalle["envios"]) == 2 and len(detalle["items"]) == 4
        assert client.post(f"{API}/prospectos/campanas/{campana['id']}/pausar").json()["data"]["estado"] == "pausada"
        assert client.post(f"{API}/prospectos/campanas/{campana['id']}/reanudar").json()["data"]["estado"] == "enviando"
        assert client.post(f"{API}/prospectos/campanas/{campana['id']}/cancelar").json()["data"]["estado"] == "cancelada"

    def test_guardar_lista_para_enviar_sin_casilla(self, client, base):
        cuerpo = {"ids": [base["a"].id], "asunto": OBRA.asuntos[0], "cuerpo": OBRA.cuerpo, "nombre": "Sin casilla"}
        assert client.post(f"{API}/prospectos/campanas/rapida", json=cuerpo).status_code == 422
        r = client.post(f"{API}/prospectos/campanas/rapida", json={**cuerpo, "enviar": False})
        assert r.status_code == 201 and r.json()["data"]["estado"] == "lista"

    def test_enviarme_una_prueba(self, client, base):
        r = client.post(f"{API}/prospectos/campanas/prueba", json={
            "asunto": OBRA.asuntos[0], "cuerpo": OBRA.cuerpo, "firma_nombre": "Franco"})
        assert r.status_code == 200 and r.json()["data"]["para"] == "operador@ubicarrent.test"

    def test_marcar_que_respondio_es_un_clic(self, client, db, base):
        r = client.post(f"{API}/prospectos/{base['a'].id}/respondio")
        assert r.status_code == 200 and r.json()["data"]["estado"] == "respondio"

    def test_el_link_de_baja_pregunta_y_recien_el_post_da_de_baja(self, client, db, base):
        url = url_de_baja(base["a"].id).split("/api/v1", 1)[1]
        r = client.get(f"{API}{url}")
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]
        assert "¿Confirmás que no querés recibir más mails de Ubicar Rent?" in r.text
        assert "Constructora Sur" in r.text and '<form method="post">' in r.text
        assert not base["a"].no_contactar, "un antivirus que abre el link no da de baja a nadie"
        # El botón, o el "Cancelar suscripción" de Gmail (One-Click): el mismo POST.
        r = client.post(f"{API}{url}", data={"List-Unsubscribe": "One-Click"})
        assert r.status_code == 200 and "no les escribimos más" in r.text
        assert base["a"].no_contactar and base["a"].no_contactar_motivo == "baja"
        assert "no les escribimos más" in client.get(f"{API}{url}").text, "volver a abrirlo ya no pregunta"
        assert client.post(f"{API}{url}").status_code == 200

    def test_un_link_de_baja_trucho_no_da_de_baja_a_nadie(self, client, db, base):
        token = reglas.token_de_baja("otro secreto", base["a"].id)
        assert client.get(f"{API}/public/baja/{token}").status_code == 404
        assert client.post(f"{API}/public/baja/{token}").status_code == 404
        assert client.post(f"{API}/public/baja/prueba").status_code == 200
        assert db.query(Prospecto).filter(Prospecto.no_contactar.is_(True)).count() == 1  # la que ya venía

    def test_el_secreto_de_la_baja_nunca_queda_vacio(self, monkeypatch):
        monkeypatch.setattr(settings, "prospeccion_secreto", "")
        assert secreto_de_baja()
        monkeypatch.setattr(settings, "prospeccion_secreto", "fijo")
        assert secreto_de_baja() == "fijo"

    def test_sin_secreto_el_webhook_no_existe(self, client, monkeypatch):
        monkeypatch.setattr(settings, "prospeccion_webhook_secret", "")
        r = client.post(f"{API}/public/webhooks/resend-prospeccion", json={"type": "email.bounced"})
        assert r.status_code == 404

    def test_el_webhook_sin_firma_o_con_firma_mala_se_rechaza(self, client, monkeypatch):
        monkeypatch.setattr(settings, "prospeccion_webhook_secret", self.SECRETO)
        url = f"{API}/public/webhooks/resend-prospeccion"
        assert client.post(url, json={"type": "email.bounced"}).status_code == 401
        cuerpo, cabeceras = _firmado("whsec_" + base64.b64encode(b"otro").decode(), {"type": "x"})
        assert client.post(url, content=cuerpo, headers=cabeceras).status_code == 401

    def test_el_webhook_firmado_aplica_el_evento_y_es_idempotente(self, client, db, base, monkeypatch):
        monkeypatch.setattr(settings, "prospeccion_webhook_secret", self.SECRETO)
        svc = ProspeccionService(db, enviador=EnviadorSimulado())
        _casilla(svc)
        _campana(svc, base, refs="a")
        svc.despachar(ahora=LUNES)
        envio = _envios(db, toque=1)[0]
        url = f"{API}/public/webhooks/resend-prospeccion"
        cuerpo, cabeceras = _firmado(self.SECRETO, {
            "type": "email.bounced", "data": {"email_id": envio.proveedor_id, "bounce": {"type": "Permanent"}}})
        assert client.post(url, content=cuerpo, headers=cabeceras).json() == {"ok": True, "resultado": "rebote"}
        assert client.post(url, content=cuerpo, headers=cabeceras).json()["resultado"] == "repetido"
        assert base["a"].no_contactar and base["a"].no_contactar_motivo == "rebote"
        # Un evento de un mail a un cliente (el webhook es de toda la cuenta): 200 y nada más.
        cuerpo, cabeceras = _firmado(self.SECRETO, {"type": "email.delivered", "data": {"email_id": "otro"}})
        assert client.post(url, content=cuerpo, headers=cabeceras).json()["resultado"] == "ajeno"

    def test_el_cron_externo_pide_el_secreto(self, client, monkeypatch):
        monkeypatch.setattr(settings, "cron_secret", "")
        assert client.post(f"{API}/prospectos/motor/cron").status_code == 404
        monkeypatch.setattr(settings, "cron_secret", "s3creto")
        assert client.post(f"{API}/prospectos/motor/cron").status_code == 401
        r = client.post(f"{API}/prospectos/motor/cron", headers={"Authorization": "Bearer s3creto"})
        assert r.status_code == 200 and "enviados" in r.json()["data"]
