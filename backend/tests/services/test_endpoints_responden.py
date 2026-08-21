"""
Los endpoints que el sistema pide al abrirse devuelven 200, no 500.

**El bug que esto ataja, y por qué costó tanto encontrarlo.**

La migración 084 sacó `Adicional.franquicia` del modelo. `AdicionalResponse`
siguió pidiéndola, y como el campo no tenía default era **requerido**: Pydantic
no encontraba el atributo, `model_validate` levantaba, y `GET /adicionales`
devolvía **500**.

Lo que lo hizo difícil de diagnosticar es que **un 500 se ve en el navegador
como un error de CORS**. La respuesta de error la genera un middleware que está
por *fuera* del de CORS, así que sale sin la cabecera
`Access-Control-Allow-Origin`, y la consola dice:

    Access to XMLHttpRequest ... has been blocked by CORS policy:
    No 'Access-Control-Allow-Origin' header is present

Dos veces se persiguió como un problema de configuración de CORS. No lo era.

Este archivo recorre los endpoints de lectura que las pantallas piden al
cargarse. No prueba lógica: prueba que **el contrato entre el modelo y el schema
no se rompió**, que es exactamente la clase de cosa que una migración rompe en
silencio.
"""
import pytest

API = "/api/v1"

# Los que el sistema pide al abrir una pantalla. Si uno de éstos tira 500, hay
# una pantalla entera que no carga.
ENDPOINTS_DE_LECTURA = [
    "/adicionales",
    "/vehiculos",
    "/clientes",
    "/reservas",
    "/categorias",
    "/cuentas-corrientes",
    "/multas",
    "/echeqs",
    "/danios",
    "/tarifas",
    "/notificaciones",
    "/pagos",
]


class TestNingunEndpointDeLecturaRevienta:
    @pytest.mark.parametrize("ruta", ENDPOINTS_DE_LECTURA)
    def test_responde_sin_error_de_servidor(self, client, ruta):
        r = client.get(f"{API}{ruta}")
        assert r.status_code < 500, (
            f"GET {ruta} devolvió {r.status_code}. Un 5xx acá se ve en el "
            f"navegador como un error de CORS, no como lo que es. "
            f"Respuesta: {r.text[:300]}"
        )


class TestElCatalogoDeAdicionales:
    """
    El que se rompió. Se prueba con datos adentro: la lista vacía nunca
    ejercita el schema de respuesta, que es justo donde estaba el problema.
    """

    @pytest.fixture()
    def catalogo(self, db):
        from decimal import Decimal

        from app.models.adicional import Adicional

        cobertura = Adicional(
            codigo="COB_TOT", nombre="Cobertura total", grupo="cobertura",
            precio=Decimal("0"), unidad_cobro="por_dia",
            porcentaje_sobre_alquiler=Decimal("30"),
            franquicia_descuento=Decimal("1000000"), activo=True,
        )
        extra = Adicional(
            codigo="GPS", nombre="GPS", grupo="extra",
            precio=Decimal("5000"), unidad_cobro="por_dia", activo=True,
        )
        db.add_all([cobertura, extra])
        db.flush()
        return cobertura, extra

    def test_devuelve_las_coberturas_con_su_descuento(self, client, db, catalogo):
        r = client.get(f"{API}/adicionales")
        assert r.status_code == 200, r.text[:400]

        datos = r.json()
        items = datos.get("data", datos)
        por_codigo = {a["codigo"]: a for a in items}

        # La API serializa Decimal como string, así que se compara el número.
        assert float(por_codigo["COB_TOT"]["franquicia_descuento"]) == 1_000_000
        # Un extra no tiene descuento de franquicia, y eso no puede romper nada.
        assert por_codigo["GPS"]["franquicia_descuento"] is None

    def test_el_publico_tambien(self, client, db, catalogo):
        """
        La web pública lee su propio endpoint, con su propia forma.

        Se chequea sólo que no reviente: este endpoint arma la respuesta a mano
        —no con `AdicionalResponse`— así que lo que importa acá es que las
        claves del modelo que toca sigan existiendo.
        """
        r = client.get(f"{API}/public/adicionales")
        assert r.status_code < 500, r.text[:400]
