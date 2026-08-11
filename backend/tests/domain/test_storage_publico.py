"""
Qué se sirve por el dominio público del bucket y qué no.

Esto existe por un incidente evitado: al habilitar el dominio público de R2,
**todo el bucket quedó de lectura sin credenciales**. Las claves de los
contratos son predecibles (`contratos/7/firma.png`), así que alcanzaba con
contar del 1 en adelante para bajarse las firmas de los clientes y los
contratos escaneados, con DNI y domicilio adentro.

El test que más importa es `test_ningun_dato_de_persona_se_sirve_publico`:
es el que se rompe si alguien agrega un prefijo a `PREFIJOS_PUBLICOS` sin
pensar qué hay adentro.
"""
from app.adapters.storage.s3 import PREFIJOS_PUBLICOS, es_publica


class TestQueEsPublico:
    def test_las_fotos_del_catalogo_si(self):
        """Las muestra el sitio a visitantes sin login: no hay nada que
        proteger, y por el CDN son más rápidas y no pasan por la API."""
        assert es_publica("categorias/demo_compacto.jpg")

    def test_la_barra_inicial_no_cambia_nada(self):
        assert es_publica("/categorias/demo_compacto.jpg")


class TestQueNoEsPublico:
    def test_la_firma_de_un_contrato(self):
        assert not es_publica("contratos/7/firma.png")

    def test_el_contrato_escaneado(self):
        assert not es_publica("contratos/7/firmado.pdf")

    def test_los_documentos_de_un_cliente(self):
        assert not es_publica("clientes/12/documentos/3-a1b2c3d4.pdf")

    def test_los_documentos_de_un_vehiculo(self):
        assert not es_publica("vehiculos/4/documentos/9-deadbeef.pdf")

    def test_las_fotos_de_un_parte_de_danos(self):
        assert not es_publica("danios/15/foto-2.jpg")

    def test_un_prefijo_desconocido_es_privado_por_defecto(self):
        """Lo que no está declarado público, no lo es. Al revés, un prefijo
        nuevo nacería público por olvido."""
        assert not es_publica("loquesea/archivo.pdf")

    def test_no_alcanza_con_empezar_parecido(self):
        """`categorias-viejas/` no es `categorias/`."""
        assert not es_publica("categorias-privadas/secreto.pdf")


def test_ningun_dato_de_persona_se_sirve_publico():
    """
    Candado sobre la lista misma. Si alguien suma un prefijo que contenga
    datos de clientes, contratos o daños, este test lo frena.
    """
    prohibidos = ("contratos", "clientes", "documentos", "danios", "firma")
    for prefijo in PREFIJOS_PUBLICOS:
        assert not any(p in prefijo for p in prohibidos), (
            f"El prefijo público '{prefijo}' parece contener datos de personas. "
            "El dominio público del bucket no pide credenciales."
        )
