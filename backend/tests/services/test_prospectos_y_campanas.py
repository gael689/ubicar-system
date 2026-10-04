"""
Prospectos de Ubicar: importar sin duplicar, cruzar con los clientes, y armar
campañas sobre una selección sin escribirle a quien no corresponde.

Pedido de Gael (04/10/2026): traer su buscador de leads al sistema de Ubicar,
cruzarlo con los clientes, y poder seleccionar en masa para lanzar campañas.
Los mensajes todavía no están escritos: la campaña se arma y se prepara, el
envío queda apagado.
"""
import pytest

from app.config import settings
from app.core.exceptions import BusinessRuleError
from app.models.cliente import Cliente
from app.models.prospecto import CampanaDestinatario, Prospecto
from app.services.prospecto_service import ProspectoService


def _item(nombre, **kw):
    return {"nombre": nombre, "ref_externa": kw.pop("ref", nombre), **kw}


@pytest.fixture
def svc(db):
    return ProspectoService(db)


class TestImportar:
    def test_importar_dos_veces_actualiza_en_vez_de_duplicar(self, db, svc):
        svc.importar([_item("Constructora Sur", ciudad="Bahía Blanca", email="a@sur.com.ar")])
        r = svc.importar([_item("Constructora Sur", telefono="2914567890")])
        assert (r["nuevos"], r["actualizados"]) == (0, 1)
        p = db.query(Prospecto).one()
        assert p.email == "a@sur.com.ar" and p.telefono == "2914567890"

    def test_un_dato_vacio_no_pisa_uno_que_ya_estaba(self, db, svc):
        svc.importar([_item("Hotel Playa", email="reservas@hotelplaya.com.ar")])
        svc.importar([_item("Hotel Playa", email="")])
        assert db.query(Prospecto).one().email == "reservas@hotelplaya.com.ar"

    def test_sin_nombre_se_descarta(self, svc):
        assert svc.importar([{"nombre": "  "}])["invalidos"] == 1

    def test_quien_pidio_que_no_lo_contacten_no_vuelve(self, db, svc):
        svc.importar([_item("Agencia Norte", no_contactar=True, no_contactar_motivo="baja")])
        svc.importar([_item("Agencia Norte", no_contactar=False)])
        p = db.query(Prospecto).one()
        assert p.no_contactar is True and p.estado == "no_contactar"


class TestCruce:
    def _cliente_empresa(self, db):
        c = Cliente(
            nombre_completo="Logística del Sur", razon_social="Logística del Sur S.R.L.",
            dni_cuit="30711111118", telefono="2914440000", email="admin@logisticadelsur.com.ar",
            tipo="empresa",
        )
        db.add(c)
        db.flush()
        return c

    def test_un_cruce_por_mail_lo_marca_cliente(self, db, svc):
        c = self._cliente_empresa(db)
        svc.importar([_item("Otro nombre", email="admin@logisticadelsur.com.ar")])
        p = db.query(Prospecto).one()
        assert p.ya_cliente_id == c.id and p.cruce_por == "email"
        assert p.estado == "cliente" and p.es_cliente

    def test_un_cruce_por_nombre_se_anota_pero_no_cambia_el_estado(self, db, svc):
        self._cliente_empresa(db)
        svc.importar([_item("Logistica del Sur SA")])
        p = db.query(Prospecto).one()
        assert p.cruce_por == "nombre" and p.estado == "nuevo"
        assert p.es_cliente, "igual no se le escribe hasta que alguien lo revise"

    def test_no_es_el_mismo_libera_el_cruce_por_nombre(self, db, svc):
        self._cliente_empresa(db)
        svc.importar([_item("Logistica del Sur SA")])
        p = db.query(Prospecto).one()
        svc.descartar_cruce(p.id)
        assert not p.es_cliente
        svc.cruzar()
        assert not p.es_cliente, "y no vuelve a marcarse en el próximo cruce"

    def test_el_cliente_generico_de_consultas_web_no_cruza(self, db, svc):
        db.add(Cliente(nombre_completo="Consultas web", dni_cuit="00000000",
                       telefono="0", tipo="particular"))
        db.flush()
        svc.importar([_item("Consultas web")])
        assert db.query(Prospecto).one().ya_cliente_id is None

    def test_un_cliente_nuevo_se_detecta_al_volver_a_cruzar(self, db, svc):
        svc.importar([_item("Transportes Norte", telefono="291 555 1234")])
        assert not db.query(Prospecto).one().es_cliente
        db.add(Cliente(nombre_completo="Transportes Norte SA", dni_cuit="30700000001",
                       telefono="291 555 1234", tipo="empresa"))
        db.flush()
        svc.cruzar()
        assert db.query(Prospecto).one().es_cliente


class TestSeleccionEnMasa:
    @pytest.fixture(autouse=True)
    def _datos(self, svc):
        svc.importar([
            _item("Constructora A", segmento="Constructoras", ciudad="Bahía Blanca", email="a@a.com.ar", score=90),
            _item("Constructora B", segmento="Constructoras", ciudad="Punta Alta", email="b@b.com.ar", score=70),
            _item("Hotel C", segmento="Turismo", ciudad="Bahía Blanca", telefono="2914567890", score=80),
            _item("Sin datos D", segmento="Turismo", ciudad="Bahía Blanca"),
        ])

    def test_listar_filtra_por_segmento_y_ciudad(self, svc):
        items, total = svc.listar({"segmento": "Constructoras", "ciudad": "Bahía Blanca"})
        assert total == 1 and items[0].nombre == "Constructora A"

    def test_solo_contactables_saca_a_los_que_no_tienen_por_donde(self, svc):
        items, total = svc.listar({"solo_contactables": True})
        assert total == 3
        assert "Sin datos D" not in [p.nombre for p in items]

    def test_seleccionar_todos_los_que_cumplen_el_filtro(self, svc):
        ids = svc.ids_por_filtro({"segmento": "Turismo"})
        assert len(ids) == 2

    def test_el_resumen_cuenta_segmentos_y_contactables(self, svc):
        r = svc.resumen()
        assert r["total"] == 4 and r["contactables"] == 3
        assert {s["segmento"]: s["cantidad"] for s in r["segmentos"]} == {"Constructoras": 2, "Turismo": 2}

    def test_no_se_puede_poner_a_mano_un_estado_de_sistema(self, svc):
        with pytest.raises(BusinessRuleError):
            svc.cambiar_estado([1], "cliente")

    def test_cambiar_estado_no_revive_a_los_que_no_hay_que_contactar(self, db, svc):
        svc.importar([_item("Baja E", no_contactar=True)])
        e = db.query(Prospecto).filter(Prospecto.nombre == "Baja E").one()
        assert svc.cambiar_estado([e.id], "nuevo") == 0


class TestCampanas:
    def _armar(self, db, svc):
        svc.importar([
            _item("Con mail", email="a@a.com.ar"),
            _item("Con tel", telefono="2914567890"),
            _item("Sin canal"),
            _item("Dio de baja", email="b@b.com.ar", no_contactar=True),
            _item("Ya contactado", email="c@c.com.ar", contacto_previo=True),
        ])
        db.add(Cliente(nombre_completo="Ya es cliente", dni_cuit="30700000002",
                       telefono="0", email="d@d.com.ar", tipo="empresa"))
        db.flush()
        svc.importar([_item("Ya es cliente SA", email="d@d.com.ar")])
        return [p.id for p in db.query(Prospecto).all()]

    def test_se_arma_con_el_motivo_de_cada_omitido(self, db, svc):
        ids = self._armar(db, svc)
        c = svc.crear_campana("Constructoras Bahía", ids, None, False, None)
        r = svc.resumen_de_campana(c)
        assert r["destinatarios"] == 6
        assert r["por_estado"]["pendiente"] == 2
        assert r["omitidos_por_motivo"] == {
            "no tiene mail ni teléfono": 1, "pidió que no lo contacten": 1,
            "ya fue contactado antes": 1, "ya es cliente": 1,
        }

    def test_se_puede_incluir_a_los_ya_contactados(self, db, svc):
        ids = self._armar(db, svc)
        c = svc.crear_campana("Con previos", ids, None, True, None)
        assert svc.resumen_de_campana(c)["por_estado"]["pendiente"] == 3

    def test_sin_nombre_o_sin_destinatarios_se_rechaza(self, db, svc):
        with pytest.raises(BusinessRuleError):
            svc.crear_campana("  ", [1], None, False, None)
        with pytest.raises(BusinessRuleError):
            svc.crear_campana("X", [], None, False, None)

    def test_un_prospecto_no_se_repite_en_la_misma_campana(self, db, svc):
        ids = self._armar(db, svc)
        svc.crear_campana("Una", ids, None, False, None)
        assert db.query(CampanaDestinatario).count() == len(ids)

    def test_preparar_sin_mensaje_se_rechaza(self, db, svc):
        ids = self._armar(db, svc)
        c = svc.crear_campana("Sin mensaje", ids, None, False, None)
        with pytest.raises(BusinessRuleError) as e:
            svc.preparar(c.id)
        assert "campana_sin_mensaje" in str(e.value)

    def test_preparar_con_el_remitente_de_prueba_se_rechaza(self, db, svc, monkeypatch):
        monkeypatch.setattr(settings, "from_email", "onboarding@resend.dev")
        ids = self._armar(db, svc)
        c = svc.crear_campana("Con mensaje", ids, None, False, None)
        svc.actualizar_mensaje(c.id, "Asunto", "Cuerpo")
        with pytest.raises(BusinessRuleError) as e:
            svc.preparar(c.id)
        assert "remitente_sin_verificar" in str(e.value)

    def test_con_mensaje_y_dominio_verificado_queda_lista_sin_enviar(self, db, svc, monkeypatch):
        monkeypatch.setattr(settings, "from_email", "noreply@ubicar-rent.com.ar")
        ids = self._armar(db, svc)
        c = svc.crear_campana("Lista", ids, None, False, None)
        svc.actualizar_mensaje(c.id, "Asunto", "Cuerpo")
        svc.preparar(c.id)
        assert c.estado == "lista" and c.lanzada_at is None, "preparar no envía"
        assert svc.resumen_de_campana(c)["por_estado"].get("enviado") is None


class TestImportarPorLaApi:
    def test_sin_token_configurado_esta_apagado(self, client, monkeypatch):
        monkeypatch.setattr(settings, "prospectos_token", "")
        r = client.post("/api/v1/prospectos/importar", json={"prospectos": []})
        assert r.status_code == 503

    def test_un_token_equivocado_se_rechaza(self, client, monkeypatch):
        monkeypatch.setattr(settings, "prospectos_token", "secreto")
        r = client.post("/api/v1/prospectos/importar", json={"prospectos": []},
                        headers={"X-Token-Prospectos": "otro"})
        assert r.status_code == 401

    def test_con_el_token_correcto_importa(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "prospectos_token", "secreto")
        r = client.post(
            "/api/v1/prospectos/importar",
            json={"prospectos": [{"nombre": "Constructora Sur", "ciudad": "Bahía Blanca"}]},
            headers={"X-Token-Prospectos": "secreto"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["nuevos"] == 1
        assert db.query(Prospecto).count() == 1

    def test_la_lista_requiere_sesion_pero_el_resumen_responde(self, client):
        r = client.get("/api/v1/prospectos/resumen")
        assert r.status_code == 200
        assert r.json()["data"]["total"] == 0
