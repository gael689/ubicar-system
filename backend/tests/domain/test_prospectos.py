"""Prospectos de Ubicar: el cruce con los clientes y a quién no se le escribe."""
from app.domain.prospectos import (
    DatosDeContacto, IndiceDeClientes, dominio_propio, motivo_para_no_escribir,
    normalizar_nombre, normalizar_telefono,
)


class TestNormalizacion:
    def test_el_telefono_es_el_mismo_con_o_sin_prefijos(self):
        assert normalizar_telefono("+54 9 291 4567890") == normalizar_telefono("291 456-7890")
        assert normalizar_telefono("(0291) 456 7890") == normalizar_telefono("+54 9 291 456-7890")

    def test_un_telefono_corto_no_sirve_para_cruzar(self):
        assert normalizar_telefono("4567") is None

    def test_el_dominio_propio_sale_de_la_web_o_del_mail(self):
        assert dominio_propio("https://www.constructora-sur.com.ar/contacto") == "constructora-sur.com.ar"
        assert dominio_propio("ventas@constructora-sur.com.ar") == "constructora-sur.com.ar"

    def test_un_dominio_compartido_no_identifica_a_nadie(self):
        assert dominio_propio("juan@gmail.com") is None
        assert dominio_propio("https://algo.wixsite.com/sitio") is None
        assert dominio_propio("https://linktr.ee/algo") is None

    def test_el_nombre_ignora_tildes_mayusculas_y_sociedad(self):
        assert normalizar_nombre("Constructora Del Sur S.R.L.") == normalizar_nombre("constructora del sur")
        assert normalizar_nombre("Logística Bahía S.A.") == "logistica bahia"

    def test_un_nombre_demasiado_corto_no_cruza(self):
        assert normalizar_nombre("SA") is None


class TestCruce:
    def _indice(self):
        return IndiceDeClientes([
            (1, DatosDeContacto(nombre="Constructora del Sur SRL", email="admin@constructoradelsur.com.ar",
                                telefono="291 456 7890")),
            (2, DatosDeContacto(nombre="Hotel Playa", email="reservas@gmail.com", telefono=None)),
        ])

    def test_por_mail_es_firme(self):
        c = self._indice().buscar(DatosDeContacto(nombre="Otra", email="ADMIN@constructoradelsur.com.ar"))
        assert (c.id, c.por, c.es_firme) == (1, "email", True)

    def test_por_telefono(self):
        c = self._indice().buscar(DatosDeContacto(telefono="+54 9 291 4567890"))
        assert (c.id, c.por) == (1, "telefono")

    def test_por_dominio_de_la_web(self):
        c = self._indice().buscar(DatosDeContacto(website="https://www.constructoradelsur.com.ar"))
        assert (c.id, c.por) == (1, "dominio")

    def test_por_nombre_no_es_firme(self):
        c = self._indice().buscar(DatosDeContacto(nombre="Hotel Playa S.A."))
        assert (c.id, c.por, c.es_firme) == (2, "nombre", False)

    def test_un_gmail_no_cruza_aunque_coincida_el_dominio(self):
        assert self._indice().buscar(DatosDeContacto(email="otro@gmail.com")) is None

    def test_sin_coincidencia_devuelve_none(self):
        assert self._indice().buscar(DatosDeContacto(nombre="Transportes Norte", telefono="11 2222 3333")) is None

    def test_gana_el_criterio_mas_fuerte(self):
        c = self._indice().buscar(DatosDeContacto(
            nombre="Hotel Playa", email="admin@constructoradelsur.com.ar"))
        assert (c.id, c.por) == (1, "email")


class TestAQuienNoSeLeEscribe:
    base = dict(ya_cliente=False, no_contactar=False, contacto_previo=False, estado="nuevo", sin_canal=False)

    def test_un_prospecto_normal_se_puede_contactar(self):
        assert motivo_para_no_escribir(**self.base) is None

    def test_quien_pidio_que_no_lo_contacten_manda_sobre_todo(self):
        assert motivo_para_no_escribir(**{**self.base, "no_contactar": True, "ya_cliente": True}) == "pidió que no lo contacten"

    def test_un_cliente_no_recibe_captacion(self):
        assert motivo_para_no_escribir(**{**self.base, "ya_cliente": True}) == "ya es cliente"

    def test_sin_mail_ni_telefono_no_hay_por_donde(self):
        assert motivo_para_no_escribir(**{**self.base, "sin_canal": True}) == "no tiene mail ni teléfono"

    def test_el_contacto_previo_bloquea_salvo_que_se_incluya(self):
        assert motivo_para_no_escribir(**{**self.base, "contacto_previo": True}) == "ya fue contactado antes"
        assert motivo_para_no_escribir(**{**self.base, "contacto_previo": True}, incluir_contacto_previo=True) is None
