"""
Tests de las plantillas de mail.

Un mail se arma en el peor momento posible: en medio de un check-out, con un
cliente esperando el auto. Si la plantilla revienta por un campo en None, el
código que la llama lo atrapa y el cliente se queda sin constancia sin que
nadie se entere. Estos tests recorren cada plantilla con datos completos y con
datos incompletos —el caso real de una reserva web, que nace por categoría y
sin patente— para que ese silencio no dependa de la suerte.

Corren sin base y sin Resend: las plantillas son funciones puras.
"""
from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import email_plantillas as p

EMPRESA = {
    "nombre_comercial": "Ubicar Rent",
    "razon_social": "FINAR GRUPO FINANCIERO S.R.L.",
    "telefonos": "+54 9 2932 47-4791",
    "email": "hola@ubicarrent.com",
}


def _reserva(**overrides):
    base = dict(
        id=482,
        estado="confirmada",
        fecha_inicio=date(2026, 8, 14),
        hora_inicio=time(10, 0),
        fecha_fin=date(2026, 8, 18),
        hora_fin=time(10, 0),
        lugar_entrega="Sucursal Bahía Blanca",
        lugar_devolucion="Sucursal Bahía Blanca",
        precio_total=Decimal("420000.00"),
        web_contacto_nombre="Lucía Fernández",
        web_contacto_email="lucia@ejemplo.com",
        vehiculo=SimpleNamespace(marca="Fiat", modelo="Cronos", patente="AB123CD"),
        categoria=SimpleNamespace(nombre="Sedán mediano"),
        cliente=SimpleNamespace(nombre_completo="Lucía Fernández", email="lucia@ejemplo.com"),
        conductor=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _alquiler(reserva=None, **overrides):
    base = dict(
        id=91,
        reserva=reserva or _reserva(),
        checkout_fecha=date(2026, 8, 14),
        checkout_hora=time(10, 15),
        checkout_km=48250,
        checkout_combustible=100,
        checkout_estado_limpieza="limpio",
        checkin_fecha=date(2026, 8, 18),
        checkin_hora=time(11, 40),
        checkin_km=49630,
        checkin_combustible=60,
        checkin_estado_limpieza="sucio",
        garantia_tipo="tarjeta",
        garantia_monto=Decimal("150000.00"),
        garantia_estado="devuelta",
        garantia_monto_devuelto=Decimal("150000.00"),
        cargo_excedente=Decimal("18000.00"),
        cargo_combustible=Decimal("32000.00"),
        cargo_limpieza=Decimal("0"),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


PAGO_WEB = SimpleNamespace(
    monto=Decimal("210000.00"),
    total_reserva=Decimal("420000.00"),
    descuento_pago_total=Decimal("0"),
    porcentaje_anticipo=50,
)


class TestPesos:
    def test_formato_argentino(self):
        assert p.pesos(Decimal("1234567.5")) == "$1.234.567,50"

    def test_none_no_rompe(self):
        # Un cargo sin cargar no puede tumbar el mail entero.
        assert p.pesos(None) == "$0,00"


class TestReservaConfirmada:
    def test_arma_con_pago_online(self):
        asunto, html = p.reserva_confirmada(_reserva(), EMPRESA, PAGO_WEB)
        assert "#482" in asunto
        assert "$210.000,00" in html          # el anticipo cobrado
        assert "$210.000,00" in html          # y el saldo, que da lo mismo acá
        assert "Fiat Cronos (AB123CD)" in html

    def test_sin_pago_online_muestra_el_total(self):
        _, html = p.reserva_confirmada(_reserva(), EMPRESA)
        assert "$420.000,00" in html

    def test_pagada_en_su_totalidad_no_pide_saldo(self):
        pago = SimpleNamespace(
            monto=Decimal("420000.00"),
            total_reserva=Decimal("420000.00"),
            descuento_pago_total=Decimal("0"),
            porcentaje_anticipo=100,
        )
        _, html = p.reserva_confirmada(_reserva(), EMPRESA, pago)
        assert "pagado en su totalidad" in html
        assert "saldo" not in html.lower()

    def test_reserva_web_sin_vehiculo_asignado_cae_a_la_categoria(self):
        # El caso real: la reserva nace por categoría y todavía no tiene auto.
        _, html = p.reserva_confirmada(_reserva(vehiculo=None), EMPRESA)
        assert "Sedán mediano" in html


class TestCheckout:
    def test_arma_la_constancia_completa(self):
        asunto, html = p.checkout(_alquiler(), EMPRESA)
        assert "#482" in asunto
        assert "48.250 km" in html
        assert "100%" in html
        assert "$150.000,00 en tarjeta" in html

    def test_sin_garantia_no_muestra_la_fila(self):
        _, html = p.checkout(_alquiler(garantia_tipo="no_aplica"), EMPRESA)
        assert "Garantía retenida" not in html

    def test_sin_estado_de_limpieza_no_rompe(self):
        _, html = p.checkout(_alquiler(checkout_estado_limpieza=None), EMPRESA)
        assert "Constancia de entrega" in html


class TestCheckin:
    def test_desglosa_cada_cargo_con_su_concepto(self):
        _, html = p.checkin(_alquiler(), EMPRESA)
        assert "Demora en la devolución" in html
        assert "Combustible faltante" in html
        # La limpieza fue 0: no se lista un cargo que no existe.
        assert "Limpieza</td>" not in html
        assert "$50.000,00" in html  # el total: 18.000 + 32.000

    def test_sin_cargos_lo_dice_explicitamente(self):
        alq = _alquiler(
            cargo_excedente=Decimal("0"),
            cargo_combustible=Decimal("0"),
            cargo_limpieza=Decimal("0"),
        )
        _, html = p.checkin(alq, EMPRESA)
        assert "ningún cargo adicional" in html

    def test_muestra_los_km_recorridos(self):
        _, html = p.checkin(_alquiler(), EMPRESA)
        assert "1.380 km" in html  # 49.630 - 48.250

    def test_checkin_sin_km_cargados_no_rompe(self):
        _, html = p.checkin(_alquiler(checkin_km=None), EMPRESA)
        assert "Cerramos tu alquiler" in html


class TestOferta:
    def test_convierte_los_parrafos_del_texto_plano(self):
        asunto, html = p.oferta("15% en agosto", "Primer párrafo.\n\nSegundo párrafo.", EMPRESA)
        assert asunto == "15% en agosto"
        assert html.count("<p style=\"margin:0 0 12px") == 2

    def test_escapa_el_html_que_venga_del_formulario(self):
        # Alguien pega texto de Word y trae etiquetas: no pueden romper el mail
        # ni inyectar nada en la casilla del cliente.
        _, html = p.oferta("Promo", "Descuento <script>alert(1)</script> especial", EMPRESA)
        assert "<script>" not in html
        assert "&lt;script&gt;" in html


class TestEscapado:
    def test_un_nombre_con_ampersand_no_rompe_el_html(self):
        reserva = _reserva(web_contacto_nombre=None, cliente=SimpleNamespace(
            nombre_completo="Martínez & Cía <SRL>", email="x@y.com"
        ))
        _, html = p.reserva_confirmada(reserva, EMPRESA)
        assert "<SRL>" not in html


class TestEmailDelCliente:
    def test_prefiere_el_contacto_de_la_web(self):
        r = _reserva(web_contacto_email="web@ejemplo.com")
        assert p.email_del_cliente(r) == "web@ejemplo.com"

    def test_cae_a_la_ficha_del_cliente(self):
        r = _reserva(web_contacto_email=None)
        assert p.email_del_cliente(r) == "lucia@ejemplo.com"

    def test_sin_ninguno_devuelve_none(self):
        r = _reserva(web_contacto_email=None, cliente=None)
        assert p.email_del_cliente(r) is None


@pytest.mark.parametrize(
    "armar",
    [
        lambda: p.reserva_confirmada(_reserva(), EMPRESA, PAGO_WEB),
        lambda: p.checkout(_alquiler(), EMPRESA),
        lambda: p.checkin(_alquiler(), EMPRESA),
        lambda: p.oferta("Promo", "Cuerpo", EMPRESA),
    ],
)
def test_toda_plantilla_devuelve_asunto_y_html_no_vacios(armar):
    asunto, html = armar()
    assert asunto.strip()
    assert html.strip().startswith("<div")
    # El pie con los datos de la empresa va en todas: es lo que hace que el
    # mail se pueda contestar.
    assert "hola@ubicarrent.com" in html
