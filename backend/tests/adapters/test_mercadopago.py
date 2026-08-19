"""
Tests del adaptador de Mercado Pago.

Hasta acá el adaptador no tenía ni uno: la primera corrida real iba a ser un
pago de verdad. Lo que se prueba es **el cuerpo que se le manda a Mercado
Pago**, porque es donde viven las decisiones que cuestan plata —qué medios se
excluyen, hasta cuándo se puede pagar, qué datos del pagador viajan— y porque
un campo mal armado no rompe el build: rompe el botón de pagar en producción,
que es donde no se puede probar.

El SDK se reemplaza por un doble. No hace falta red ni credenciales.
"""
from datetime import datetime
from decimal import Decimal

import pytest

from app.adapters.pagos.interface import Pagador, ReglasCobro
from app.adapters.pagos.mercadopago import MercadoPagoPasarela


class _Preferencias:
    def __init__(self, respuesta):
        self.respuesta = respuesta
        self.recibido = None

    def create(self, datos):
        self.recibido = datos
        return self.respuesta


class _Pagos:
    def __init__(self, respuesta):
        self.respuesta = respuesta
        self.consultado = None

    def get(self, payment_id):
        self.consultado = payment_id
        return self.respuesta


class _SDKFalso:
    def __init__(self, respuesta_preferencia=None, respuesta_pago=None):
        self._pref = _Preferencias(respuesta_preferencia)
        self._pago = _Pagos(respuesta_pago)

    def preference(self):
        return self._pref

    def payment(self):
        return self._pago


RESPUESTA_OK = {
    "status": 201,
    "response": {
        "id": "pref-123",
        "init_point": "https://www.mercadopago.com.ar/checkout?pref_id=pref-123",
        "sandbox_init_point": "https://sandbox.mercadopago.com.ar/checkout?pref_id=pref-123",
    },
}


def _pasarela(monkeypatch, respuesta=RESPUESTA_OK, *, sandbox=False):
    sdk = _SDKFalso(respuesta_preferencia=respuesta)
    pasarela = MercadoPagoPasarela("TEST-token", sandbox=sandbox)
    monkeypatch.setattr(pasarela, "_sdk", lambda: sdk)
    return pasarela, sdk


def _crear(pasarela, **extra):
    datos = dict(
        titulo="Reserva Compacto — Ubicar Rent",
        monto=Decimal("45000.00"),
        referencia_externa="ubicar-reserva-7",
        pagador=Pagador(email="cliente@ejemplo.com"),
        url_exito="https://ubicar-rent.com.ar/reservar/listo?status=approved",
        url_pendiente="https://ubicar-rent.com.ar/reservar/listo?status=pending",
        url_error="https://ubicar-rent.com.ar/reservar/listo?status=failure",
        url_webhook="https://api.ubicar-rent.com.ar/api/v1/public/webhooks/mercadopago",
    )
    datos.update(extra)
    return pasarela.crear_preferencia(**datos)


# ─── Sin credenciales no se instancia ────────────────────────────────────────

def test_sin_token_no_se_puede_construir():
    from app.adapters.pagos.interface import PasarelaNoConfigurada

    with pytest.raises(PasarelaNoConfigurada):
        MercadoPagoPasarela("")


# ─── Lo que decide si se cobra bien ──────────────────────────────────────────

def test_el_efectivo_se_excluye_siempre_por_defecto(monkeypatch):
    """
    Rapipago y los cajeros se acreditan a los tres días y el hold dura veinte
    minutos: para cuando entra la plata el auto ya se alquiló.
    """
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela)

    excluidos = sdk._pref.recibido["payment_methods"]["excluded_payment_types"]
    assert {"id": "ticket"} in excluidos
    assert {"id": "atm"} in excluidos


def test_el_tope_de_cuotas_viaja_cuando_esta_definido(monkeypatch):
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, reglas=ReglasCobro(cuotas_maximas=3))

    assert sdk._pref.recibido["payment_methods"]["installments"] == 3


def test_cuotas_en_cero_no_manda_el_campo(monkeypatch):
    """Cero significa 'lo que Mercado Pago ofrezca', no 'cero cuotas'."""
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, reglas=ReglasCobro(cuotas_maximas=0))

    assert "installments" not in sdk._pref.recibido["payment_methods"]


def test_sin_restricciones_no_se_manda_payment_methods(monkeypatch):
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, reglas=ReglasCobro(excluir_efectivo=False, cuotas_maximas=None))

    assert "payment_methods" not in sdk._pref.recibido


def test_el_vencimiento_va_con_offset_explicito(monkeypatch):
    """
    Mercado Pago rechaza la preferencia entera si la fecha no lleva offset, y
    el síntoma es un botón de pagar que falla antes de llegar al checkout.
    Los timestamps del sistema son UTC sin `tzinfo`.
    """
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, reglas=ReglasCobro(vence_en=datetime(2026, 8, 19, 14, 30, 0)))

    enviado = sdk._pref.recibido
    assert enviado["expires"] is True
    assert enviado["expiration_date_to"] == "2026-08-19T14:30:00.000+00:00"


def test_sin_vencimiento_la_preferencia_no_expira(monkeypatch):
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, reglas=ReglasCobro(vence_en=None))

    assert "expiration_date_to" not in sdk._pref.recibido
    assert "expires" not in sdk._pref.recibido


def test_la_referencia_externa_y_el_webhook_viajan_tal_cual(monkeypatch):
    """
    Son las dos cosas de las que depende que un pago encuentre su reserva. Si
    el `notification_url` se pierde, ninguna reserva se confirma nunca — y
    falla en silencio, porque el webhook siempre responde 200.
    """
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela)

    enviado = sdk._pref.recibido
    assert enviado["external_reference"] == "ubicar-reserva-7"
    assert enviado["notification_url"].endswith("/api/v1/public/webhooks/mercadopago")


# ─── Los datos del pagador ───────────────────────────────────────────────────

def test_el_pagador_viaja_completo(monkeypatch):
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, pagador=Pagador(
        email="juan@ejemplo.com", nombre="Juan", apellido="Pérez",
        telefono="2914180554", dni="30123456",
    ))

    payer = sdk._pref.recibido["payer"]
    assert payer["email"] == "juan@ejemplo.com"
    assert payer["name"] == "Juan"
    assert payer["surname"] == "Pérez"
    assert payer["identification"] == {"type": "DNI", "number": "30123456"}
    assert payer["phone"] == {"number": "2914180554"}


def test_los_campos_vacios_del_pagador_no_se_mandan(monkeypatch):
    """
    Un `identification` con número vacío es peor que no mandarlo: Mercado Pago
    lo toma como documento inválido.
    """
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, pagador=Pagador(email="juan@ejemplo.com", apellido=""))

    payer = sdk._pref.recibido["payer"]
    assert payer == {"email": "juan@ejemplo.com"}


def test_pagador_totalmente_vacio_no_agrega_la_clave(monkeypatch):
    pasarela, sdk = _pasarela(monkeypatch)
    _crear(pasarela, pagador=Pagador())

    assert "payer" not in sdk._pref.recibido


# ─── init_point según el ambiente ────────────────────────────────────────────

def test_en_produccion_se_usa_init_point(monkeypatch):
    pasarela, _ = _pasarela(monkeypatch, sandbox=False)
    assert "sandbox" not in _crear(pasarela).init_point


def test_en_sandbox_se_usa_sandbox_init_point(monkeypatch):
    pasarela, _ = _pasarela(monkeypatch, sandbox=True)
    assert "sandbox" in _crear(pasarela).init_point


def test_sin_sandbox_init_point_cae_al_normal(monkeypatch):
    """
    El esquema nuevo de usuarios de prueba de Mercado Pago usa `init_point`
    igual que producción. Si la respuesta no trae el de sandbox, se usa el que
    hay en vez de devolver `None` y mandar al cliente a ninguna parte.
    """
    respuesta = {"status": 201, "response": {"id": "p", "init_point": "https://mp/x"}}
    pasarela, _ = _pasarela(monkeypatch, respuesta, sandbox=True)

    assert _crear(pasarela).init_point == "https://mp/x"


# ─── Cuando Mercado Pago dice que no ─────────────────────────────────────────

def test_una_preferencia_rechazada_levanta(monkeypatch):
    """
    No puede devolver algo a medias: el llamador crea la reserva antes y sin
    excepción quedaría una reserva en `pendiente_pago` sin forma de pagarla.
    """
    respuesta = {"status": 400, "response": {"message": "invalid back_urls"}}
    pasarela, _ = _pasarela(monkeypatch, respuesta)

    with pytest.raises(RuntimeError, match="invalid back_urls"):
        _crear(pasarela)


# ─── Leer el pago, que es la fuente de verdad ────────────────────────────────

def test_obtener_pago_mapea_lo_que_importa(monkeypatch):
    respuesta = {
        "status": 200,
        "response": {
            "id": 987654321,
            "status": "approved",
            "transaction_amount": 45000.5,
            "external_reference": "ubicar-reserva-7",
            "payment_method_id": "visa",
        },
    }
    sdk = _SDKFalso(respuesta_pago=respuesta)
    pasarela = MercadoPagoPasarela("TEST-token")
    monkeypatch.setattr(pasarela, "_sdk", lambda: sdk)

    pago = pasarela.obtener_pago("987654321")

    assert pago.payment_id == "987654321"      # str, no int
    assert pago.estado == "approved"
    assert pago.monto == Decimal("45000.5")    # Decimal, no float
    assert pago.referencia_externa == "ubicar-reserva-7"
    assert pago.medio_pago == "visa"
    assert pago.crudo["id"] == 987654321       # la respuesta entera, para auditar


def test_el_monto_llega_como_decimal_exacto(monkeypatch):
    """
    El monto decide si se confirma una reserva y se compara **al centavo**
    contra lo que se pidió. Pasando por float, 45000.10 no es 45000.10.
    """
    respuesta = {
        "status": 200,
        "response": {"id": 1, "status": "approved", "transaction_amount": 45000.10},
    }
    sdk = _SDKFalso(respuesta_pago=respuesta)
    pasarela = MercadoPagoPasarela("TEST-token")
    monkeypatch.setattr(pasarela, "_sdk", lambda: sdk)

    assert pasarela.obtener_pago("1").monto == Decimal("45000.1")


def test_un_pago_que_no_se_puede_leer_levanta(monkeypatch):
    """
    Silenciarlo confirmaría reservas sin haber verificado el cobro. El router
    lo captura y lo deja en `revision`.
    """
    sdk = _SDKFalso(respuesta_pago={"status": 404, "response": {"message": "not found"}})
    pasarela = MercadoPagoPasarela("TEST-token")
    monkeypatch.setattr(pasarela, "_sdk", lambda: sdk)

    with pytest.raises(RuntimeError):
        pasarela.obtener_pago("no-existe")
