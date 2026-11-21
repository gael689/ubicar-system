"""
Importar una lista nueva no duplica empresas que ya estaban.

Hasta el 21/11/2026 la importación sólo reconocía por `ref_externa` (el id del
buscador de Gael). Una lista investigada a mano trae otras refs —o ninguna—, así
que cada empresa repetida entraba de nuevo y después recibía dos veces la misma
campaña. Ahora, si la ref no coincide, se la busca por mail, teléfono o dominio.
"""
import pytest

from app.models.prospecto import Prospecto
from app.services.prospecto_service import ProspectoService

API = "/api/v1"


@pytest.fixture
def svc(db):
    s = ProspectoService(db)
    s.importar([{
        "ref_externa": "ChIJ-google-1", "nombre": "Constructora Sur S.A.", "ciudad": "Bahía Blanca",
        "segmento": "Constructoras y Desarrollo", "email": "compras@constructorasur.com.ar",
        "telefono": "0291 456-7890", "website": "https://www.constructorasur.com.ar/contacto",
    }])
    return s


def _una(db):
    return db.query(Prospecto).one()


class TestSeReconoceAunqueLaRefNoCoincida:
    def test_por_el_mail(self, db, svc):
        r = svc.importar([{"ref_externa": "manual-17", "nombre": "CONSTRUCTORA SUR",
                           "email": " Compras@ConstructoraSur.com.ar ", "instagram": "@constructorasur"}])
        assert (r["nuevos"], r["actualizados"]) == (0, 1)
        p = _una(db)
        assert p.instagram == "@constructorasur" and p.ref_externa == "ChIJ-google-1", "la ref original queda"

    def test_por_el_telefono_escrito_de_otra_forma(self, db, svc):
        r = svc.importar([{"nombre": "Constructora Sur", "telefono": "+54 9 291 4567890"}])
        assert r["actualizados"] == 1 and _una(db).telefono == "+54 9 291 4567890"

    def test_por_el_dominio_propio_si_el_nombre_se_parece(self, db, svc):
        r = svc.importar([{"nombre": "Constructora Sur", "email": "administracion@constructorasur.com.ar"}])
        assert r["actualizados"] == 1 and db.query(Prospecto).count() == 1

    def test_el_mismo_dominio_con_otro_nombre_es_otra_empresa(self, db, svc):
        """Dos empresas de un mismo grupo comparten web: no son la misma."""
        r = svc.importar([{"nombre": "Hormigones del Puerto", "website": "constructorasur.com.ar"}])
        assert r["nuevos"] == 1 and db.query(Prospecto).count() == 2

    def test_un_gmail_o_un_portal_no_identifican_a_nadie(self, db, svc):
        svc.importar([{"nombre": "Hotel Uno", "website": "https://www.booking.com/hotel/ar/uno.html",
                       "email": "hoteluno@gmail.com"}])
        r = svc.importar([{"nombre": "Hotel Dos", "website": "https://www.booking.com/hotel/ar/dos.html",
                           "email": "hoteldos@gmail.com"}])
        assert r["nuevos"] == 1 and db.query(Prospecto).count() == 3

    def test_no_pisa_con_vacio_ni_revive_a_quien_pidio_la_baja(self, db, svc):
        p = _una(db)
        p.no_contactar, p.estado = True, "no_contactar"
        db.flush()
        svc.importar([{"nombre": "Constructora Sur", "email": "compras@constructorasur.com.ar",
                       "ciudad": "", "no_contactar": False}])
        assert p.ciudad == "Bahía Blanca" and p.no_contactar and p.estado == "no_contactar"

    def test_dos_filas_del_mismo_archivo_que_son_la_misma_empresa(self, db, svc):
        r = svc.importar([
            {"nombre": "Hotel Austral", "email": "reservas@hotelaustral.com.ar"},
            {"nombre": "Hotel Austral SRL", "email": "reservas@hotelaustral.com.ar", "ciudad": "Bahía Blanca"},
        ])
        assert (r["nuevos"], r["actualizados"]) == (1, 1)
        hotel = db.query(Prospecto).filter(Prospecto.email == "reservas@hotelaustral.com.ar").one()
        assert hotel.ciudad == "Bahía Blanca"

    def test_la_ref_sigue_siendo_lo_primero(self, db, svc):
        r = svc.importar([{"ref_externa": "ChIJ-google-1", "nombre": "Constructora Sur",
                           "email": "nuevo@constructorasur.com.ar"}])
        assert r["actualizados"] == 1 and _una(db).email == "nuevo@constructorasur.com.ar"


class TestElArchivoInvestigadoAMano:
    ARCHIVO = {"prospectos": [{
        "ref_externa": "manual-001", "nombre": "Logística Austral", "segmento": "Logistica y Depositos",
        "ciudad": "Bahía Blanca", "direccion": "Ruta 3 km 695", "telefono": "291 455-0000",
        "email": "contacto@logisticaaustral.com.ar", "website": "logisticaaustral.com.ar",
        "instagram": "@logisticaaustral", "score": 85, "notas": "Tienen depósito en el parque industrial",
        "fuente": "LinkedIn",
    }]}

    def test_se_acepta_tal_cual_y_la_fuente_queda_en_las_notas(self, client, db):
        r = client.post(f"{API}/prospectos/importar-archivo", json=self.ARCHIVO)
        assert r.status_code == 200 and r.json()["data"]["nuevos"] == 1
        p = db.query(Prospecto).one()
        assert (p.score, p.direccion, p.instagram) == (85, "Ruta 3 km 695", "@logisticaaustral")
        assert p.notas == "Tienen depósito en el parque industrial\nFuente: LinkedIn"
        # Importarlo de nuevo no repite la fuente.
        client.post(f"{API}/prospectos/importar-archivo", json=self.ARCHIVO)
        assert db.query(Prospecto).one().notas.count("Fuente: LinkedIn") == 1

    def test_el_score_puede_venir_con_decimales_o_como_texto(self, client, db):
        fila = {**self.ARCHIVO["prospectos"][0], "score": "72.6"}
        assert client.post(f"{API}/prospectos/importar-archivo", json={"prospectos": [fila]}).status_code == 200
        assert db.query(Prospecto).one().score == 73
        fila["score"] = "alto"
        assert client.post(f"{API}/prospectos/importar-archivo", json={"prospectos": [fila]}).status_code == 200
        assert db.query(Prospecto).one().score == 73, "un score ilegible no pisa el que había"

    def test_la_vista_previa_cuenta_y_no_guarda_nada(self, client, db, svc):
        filas = self.ARCHIVO["prospectos"] + [
            {"nombre": "Constructora Sur", "telefono": "2914567890", "ciudad": "Otra"},
            {"nombre": "Logística Austral SA", "email": "contacto@logisticaaustral.com.ar"},
            {"nombre": "   "},
        ]
        r = client.post(f"{API}/prospectos/importar-archivo?simular=true", json={"prospectos": filas})
        assert r.json()["data"] == {"nuevos": 1, "actualizados": 2, "invalidos": 1, "ya_clientes": 0}
        db.expire_all()
        assert db.query(Prospecto).count() == 1 and _una(db).ciudad == "Bahía Blanca"


class TestAgregarAMano:
    def test_agrega_una_empresa_nueva(self, client, db):
        r = client.post(f"{API}/prospectos", json={
            "nombre": "Catering del Sur", "segmento": "Eventos y Catering", "ciudad": "Bahía Blanca",
            "email": "hola@cateringdelsur.com.ar", "notas": "Recomendados por Martín"})
        assert r.status_code == 201
        d = r.json()["data"]
        assert d["era_nuevo"] and d["estado"] == "nuevo" and d["notas"] == "Recomendados por Martín"

    def test_si_ya_estaba_completa_la_que_habia(self, client, db, svc):
        r = client.post(f"{API}/prospectos", json={
            "nombre": "Constructora Sur", "email": "compras@constructorasur.com.ar", "instagram": "@sur"})
        d = r.json()["data"]
        assert not d["era_nuevo"] and d["instagram"] == "@sur" and db.query(Prospecto).count() == 1
        assert "ya estaba" in r.json()["message"]

    def test_sin_mail_ni_telefono_tambien_se_puede_cargar(self, client, db):
        r = client.post(f"{API}/prospectos", json={"nombre": "Solo el nombre"})
        assert r.status_code == 201 and r.json()["data"]["era_nuevo"]

    def test_sin_nombre_no(self, client):
        assert client.post(f"{API}/prospectos", json={"nombre": "  "}).status_code == 422
