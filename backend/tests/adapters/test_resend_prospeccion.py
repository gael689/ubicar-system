"""
Los dos adapters de Resend de la prospección, contra un transporte falso de
httpx: **ningún test sale a la red**. Se prueba lo que viaja (cabeceras, clave
de idempotencia) y cómo se lee lo que vuelve (errores, permisos, registros DNS).
"""
import json

import httpx
import pytest

from app.adapters.resend_dominios import ErrorDeResend, ResendDominios, SinPermiso
from app.adapters.resend_prospeccion import EnviadorResend, MailDeProspeccion


def _cliente(responder):
    pedidos = []

    def manejar(request: httpx.Request) -> httpx.Response:
        pedidos.append(request)
        return responder(request)

    return httpx.Client(base_url="https://api.resend.com", transport=httpx.MockTransport(manejar)), pedidos


MAIL = MailDeProspeccion(
    desde="Franco de Ubicar Rent <franco@empresas.ubicar-rent.com.ar>", para="compras@sur.com.ar",
    asunto="Camionetas para obra", texto="Hola", html="<div>Hola</div>",
    responder_a="ventas@ubicar-rent.com.ar",
    cabeceras={"List-Unsubscribe": "<https://x/baja/t>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
    clave_idempotencia="ubicar-prospeccion-17",
)


class TestEnvio:
    def test_manda_remitente_responder_a_texto_cabeceras_y_la_clave_de_idempotencia(self):
        cliente, pedidos = _cliente(lambda r: httpx.Response(200, json={"id": "re_123"}))
        resultado = EnviadorResend("re_key", cliente=cliente).enviar(MAIL)
        assert resultado.ok and resultado.proveedor_id == "re_123" and not resultado.simulado
        pedido = pedidos[0]
        assert pedido.url.path == "/emails" and pedido.headers["authorization"] == "Bearer re_key"
        assert pedido.headers["idempotency-key"] == "ubicar-prospeccion-17"
        cuerpo = json.loads(pedido.content)
        assert cuerpo == {
            "from": MAIL.desde, "to": ["compras@sur.com.ar"], "subject": "Camionetas para obra",
            "text": "Hola", "html": "<div>Hola</div>", "reply_to": "ventas@ubicar-rent.com.ar",
            "headers": MAIL.cabeceras,
        }

    @pytest.mark.parametrize("status,transitorio", [(429, True), (500, True), (503, True), (403, False), (422, False)])
    def test_distingue_lo_que_vale_la_pena_reintentar(self, status, transitorio):
        cliente, _ = _cliente(lambda r: httpx.Response(status, json={"message": "no"}))
        resultado = EnviadorResend("k", cliente=cliente).enviar(MAIL)
        assert not resultado.ok and resultado.transitorio is transitorio and str(status) in resultado.error

    def test_si_se_cae_la_red_no_revienta(self):
        def sin_red(request):
            raise httpx.ConnectError("sin red")
        cliente, _ = _cliente(sin_red)
        resultado = EnviadorResend("k", cliente=cliente).enviar(MAIL)
        assert not resultado.ok and resultado.transitorio and "ConnectError" in resultado.error


DOMINIO = {
    "id": "d1", "name": "empresas.ubicar-rent.com.ar", "status": "pending",
    "records": [
        {"record": "SPF", "name": "send.empresas", "type": "MX", "value": "feedback-smtp.sa-east-1.amazonses.com",
         "priority": 10, "status": "verified"},
        {"record": "SPF", "name": "send.empresas", "type": "TXT", "value": "v=spf1 include:amazonses.com ~all",
         "status": "not_started"},
        {"record": "DKIM", "name": "resend._domainkey.empresas", "type": "TXT", "value": "p=MIG", "status": "failed"},
    ],
}


class TestDominios:
    def test_lista_los_dominios_con_su_estado(self):
        cliente, _ = _cliente(lambda r: httpx.Response(200, json={"data": [
            {"id": "d1", "name": "Empresas.ubicar-rent.com.ar", "status": "verified"},
            {"id": "d2", "name": "otro.com", "status": "not_started"}]}))
        dominios = ResendDominios("k", cliente=cliente).listar()
        assert [(d.nombre, d.estado, d.verificado) for d in dominios] == [
            ("empresas.ubicar-rent.com.ar", "verificado", True), ("otro.com", "pendiente", False)]

    def test_crear_devuelve_los_registros_dns_a_cargar(self):
        cliente, pedidos = _cliente(lambda r: httpx.Response(201, json=DOMINIO))
        d = ResendDominios("k", cliente=cliente).crear("empresas.ubicar-rent.com.ar", "sa-east-1")
        assert json.loads(pedidos[0].content) == {"name": "empresas.ubicar-rent.com.ar", "region": "sa-east-1"}
        assert [(r.proposito, r.tipo, r.nombre, r.prioridad, r.estado) for r in d.registros] == [
            ("SPF", "MX", "send.empresas", 10, "verificado"),
            ("SPF", "TXT", "send.empresas", None, "pendiente"),
            ("DKIM", "TXT", "resend._domainkey.empresas", None, "fallido"),
        ]

    def test_verificar_y_obtener_pegan_donde_corresponde(self):
        cliente, pedidos = _cliente(lambda r: httpx.Response(200, json=DOMINIO))
        api = ResendDominios("k", cliente=cliente)
        api.verificar("d1")
        api.obtener("d1")
        assert [(p.method, p.url.path) for p in pedidos] == [("POST", "/domains/d1/verify"), ("GET", "/domains/d1")]

    @pytest.mark.parametrize("status", [401, 403])
    def test_una_key_de_solo_envio_es_sin_permiso_no_un_error(self, status):
        cliente, _ = _cliente(lambda r: httpx.Response(status, json={"name": "restricted_api_key"}))
        with pytest.raises(SinPermiso):
            ResendDominios("k", cliente=cliente).listar()

    def test_sin_key_tambien_es_sin_permiso_y_no_sale_a_la_red(self):
        cliente, pedidos = _cliente(lambda r: httpx.Response(200, json={}))
        with pytest.raises(SinPermiso):
            ResendDominios("", cliente=cliente).listar()
        assert pedidos == []

    def test_un_error_de_resend_llega_legible(self):
        cliente, _ = _cliente(lambda r: httpx.Response(422, json={"message": "Domain already exists"}))
        with pytest.raises(ErrorDeResend) as e:
            ResendDominios("k", cliente=cliente).crear("x.ubicar-rent.com.ar", "sa-east-1")
        assert "422" in str(e.value) and "already exists" in str(e.value)
