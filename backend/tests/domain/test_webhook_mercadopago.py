"""
De qué avisos de Mercado Pago sacamos un número de pago.

Es la puerta de entrada del cobro: si acá no se reconoce el formato, el aviso
se descarta como "no es un pago", la reserva **nunca se confirma** y nadie se
entera — el webhook responde 200 igual, a propósito, así que el panel de
Mercado Pago muestra todo en verde.

MP manda el id en tres formatos distintos según el tipo de notificación y la
antigüedad de la integración, y manda además avisos de otros temas que hay que
ignorar sin romperse.
"""
from app.routers.public import _extraer_payment_id


# ─── Los tres formatos que hay que reconocer ─────────────────────────────────

def test_formato_nuevo_type_payment():
    cuerpo = {"type": "payment", "action": "payment.created", "data": {"id": "123456789"}}

    assert _extraer_payment_id(cuerpo, {}) == "123456789"


def test_formato_viejo_topic_resource():
    """El `resource` viene como URL completa: el id es lo último."""
    cuerpo = {"topic": "payment", "resource": "https://api.mercadolibre.com/collections/notifications/98765"}

    assert _extraer_payment_id(cuerpo, {}) == "98765"


def test_formato_por_query_string():
    """Cuando MP avisa por GET-style, el id viaja en `data.id` de la query."""
    assert _extraer_payment_id({}, {"type": "payment", "data.id": "555"}) == "555"


def test_el_id_siempre_sale_como_texto():
    """
    MP lo manda como número en algunos avisos. Se guarda en una columna de
    texto y se compara contra lo guardado: mezclar 123 con "123" rompe la
    idempotencia y un pago genera dos asientos.
    """
    resultado = _extraer_payment_id({"type": "payment", "data": {"id": 123456789}}, {})

    assert resultado == "123456789"
    assert isinstance(resultado, str)


# ─── Lo que hay que ignorar sin romperse ─────────────────────────────────────

def test_una_merchant_order_no_es_un_pago():
    """
    MP avisa también de merchant orders. No son un error: simplemente no nos
    interesan, y tratarlas como pago haría fallar la consulta a la API.
    """
    cuerpo = {"type": "merchant_order", "data": {"id": "999"}}

    assert _extraer_payment_id(cuerpo, {}) is None


def test_un_cuerpo_vacio_no_rompe():
    """Pasa: MP manda pings, y un JSON ilegible llega como `{}` desde el router."""
    assert _extraer_payment_id({}, {}) is None


def test_type_payment_sin_id_no_inventa_nada():
    assert _extraer_payment_id({"type": "payment", "data": {}}, {}) is None


def test_topic_payment_sin_resource_no_rompe():
    assert _extraer_payment_id({"topic": "payment"}, {}) is None


def test_una_query_de_otro_topic_se_ignora():
    assert _extraer_payment_id({}, {"type": "merchant_order", "data.id": "555"}) is None
