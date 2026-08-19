"""
La firma del webhook de Mercado Pago.

El valor de `V1_ESPERADO` no está calculado con el mismo código que se prueba
—eso no probaría nada—: sale de correr la implementación de JLI
(`supabase/functions/_shared/mp.ts`), que está andando en producción contra
Mercado Pago de verdad, con este mismo secreto, request-id y ts. Si alguien
cambia el manifiesto, este test se cae.
"""
import pytest

from app.domain.webhook_mp import (
    firma_valida,
    lleva_firma,
    manifiesto,
    parsear_x_signature,
)

SECRETO = "bd1d9c3c7fa8b46611f221ce6fe95b2df74e3e2ff7e7c16a2986c4a355ea20c5"
TS = "1755600000"
REQUEST_ID = "abc-123-req"
DATA_ID = "123456789"
V1_ESPERADO = "4332d81f4ac42d506424be31b251d08c408ee66075d2fd0088dee58e75e149a6"


def _header(v1=V1_ESPERADO, ts=TS):
    return f"ts={ts},v1={v1}"


# ─── El manifiesto, que es donde se equivoca todo el mundo ───────────────────

def test_el_manifiesto_es_el_que_firma_mercado_pago():
    assert manifiesto(DATA_ID, REQUEST_ID, TS) == (
        f"id:{DATA_ID};request-id:{REQUEST_ID};ts:{TS};"
    )


def test_el_id_se_pasa_a_minusculas():
    """
    Los ids de pago son numéricos y no cambia nada, pero MP firma en
    minúsculas y otros recursos sí son alfanuméricos.
    """
    assert manifiesto("ABC123", REQUEST_ID, TS).startswith("id:abc123;")


def test_el_punto_y_coma_final_es_parte_del_manifiesto():
    assert manifiesto(DATA_ID, REQUEST_ID, TS).endswith(";")


# ─── Contra la implementación que ya anda en producción ──────────────────────

def test_acepta_la_firma_calculada_por_la_implementacion_de_jli():
    assert firma_valida(
        secreto=SECRETO, x_signature=_header(),
        x_request_id=REQUEST_ID, data_id=DATA_ID,
    ) is True


# ─── Lo que tiene que rechazar ───────────────────────────────────────────────

@pytest.mark.parametrize("header", [
    None,
    "",
    "no-es-un-header",
    f"ts={TS}",                                  # sin v1
    f"v1={V1_ESPERADO}",                         # sin ts
])
def test_headers_rotos_no_pasan(header):
    assert firma_valida(
        secreto=SECRETO, x_signature=header,
        x_request_id=REQUEST_ID, data_id=DATA_ID,
    ) is False


def test_una_firma_que_no_corresponde_no_pasa():
    assert firma_valida(
        secreto=SECRETO, x_signature=_header(v1="0" * 64),
        x_request_id=REQUEST_ID, data_id=DATA_ID,
    ) is False


def test_cambiar_el_ts_invalida_la_firma():
    """El ts entra en el manifiesto: reusar una firma con otro ts no sirve."""
    assert firma_valida(
        secreto=SECRETO, x_signature=_header(ts="1755600001"),
        x_request_id=REQUEST_ID, data_id=DATA_ID,
    ) is False


def test_cambiar_el_payment_id_invalida_la_firma():
    """Es lo que impide reusar un aviso legítimo apuntándolo a otro pago."""
    assert firma_valida(
        secreto=SECRETO, x_signature=_header(),
        x_request_id=REQUEST_ID, data_id="987654321",
    ) is False


def test_cambiar_el_request_id_invalida_la_firma():
    assert firma_valida(
        secreto=SECRETO, x_signature=_header(),
        x_request_id="otro-request", data_id=DATA_ID,
    ) is False


def test_el_secreto_equivocado_no_pasa():
    """
    El caso real: cargar el secreto del webhook de prueba en producción. Son
    distintos y el panel no lo aclara.
    """
    assert firma_valida(
        secreto="el-de-prueba", x_signature=_header(),
        x_request_id=REQUEST_ID, data_id=DATA_ID,
    ) is False


# ─── Sin secreto no se valida, a propósito ───────────────────────────────────

@pytest.mark.parametrize("aviso", [
    {"x_signature": None, "x_request_id": None, "data_id": DATA_ID},
    {"x_signature": "basura", "x_request_id": "x", "data_id": DATA_ID},
])
def test_sin_secreto_configurado_pasa_cualquier_aviso(aviso):
    """
    Deliberado. La validación es una mejora sobre un endpoint que ya era
    seguro: el monto y el estado se releen contra la API de MP. Empezar a
    rechazar avisos porque falta una variable de entorno significaría que
    **ninguna reserva se confirma más**, y en silencio.
    """
    assert firma_valida(secreto="", **aviso) is True


# ─── El parseo del header ────────────────────────────────────────────────────

def test_el_header_tolera_espacios():
    assert parsear_x_signature(f"ts={TS} , v1={V1_ESPERADO}") == (TS, V1_ESPERADO)


def test_el_header_tolera_claves_de_mas():
    """MP agregó campos antes y los puede volver a agregar."""
    assert parsear_x_signature(f"ts={TS},v2=algo,v1={V1_ESPERADO}") == (TS, V1_ESPERADO)


def test_un_header_vacio_no_rompe():
    assert parsear_x_signature(None) == (None, None)


# ─── El formato viejo, que Mercado Pago no firma ─────────────────────────────
#
# Descubierto el 19/08/2026 con el primer pago real: por cada pago llegan dos
# avisos y sólo uno se puede verificar. Los datos de acá son los del aviso
# legacy real que el endpoint rechazó con 401.

# Firma real de un aviso `topic=payment` del pago 174642477530, con el secreto
# de producción cargado. No coincide con ningún manifiesto: está acá para dejar
# constancia de que se intentó y de con qué.
LEGACY_TS = "1787166825"
LEGACY_V1 = "6ff405b17b81eb221cf5a86792dcd69c5d8b1dddd464e5d7b4a927afbf83b089"
LEGACY_REQUEST_ID = "717663fe-46e7-4226-bbde-225838aa8f12"
LEGACY_PAYMENT_ID = "174642477530"


def test_el_formato_nuevo_se_valida():
    assert lleva_firma({"type": "payment", "data": {"id": "1"}}, {}) is True


def test_el_formato_nuevo_por_query_tambien():
    assert lleva_firma({}, {"type": "payment", "data.id": "1"}) is True


def test_el_formato_viejo_no_se_valida():
    """
    `topic=payment` es el aviso IPN. Trae `x-signature` pero Mercado Pago no lo
    firma con el secreto del webhook, así que validarlo significaba devolverle
    401 a un aviso legítimo — y que Mercado Pago reintentara durante horas
    marcando el webhook en rojo.
    """
    cuerpo = {"topic": "payment", "resource": f"https://api.mercadolibre.com/v1/payments/{LEGACY_PAYMENT_ID}"}
    assert lleva_firma(cuerpo, {"topic": "payment", "id": LEGACY_PAYMENT_ID}) is False


def test_la_merchant_order_tampoco():
    assert lleva_firma({"topic": "merchant_order"}, {"topic": "merchant_order", "id": "9"}) is False


def test_la_firma_real_del_aviso_viejo_efectivamente_no_valida():
    """
    Deja constancia de por qué existe `lleva_firma`. Si algún día Mercado Pago
    empieza a firmar el formato viejo con este secreto, este test se cae y hay
    que revisar la decisión.
    """
    assert firma_valida(
        secreto=SECRETO,
        x_signature=f"ts={LEGACY_TS},v1={LEGACY_V1}",
        x_request_id=LEGACY_REQUEST_ID,
        data_id=LEGACY_PAYMENT_ID,
    ) is False
