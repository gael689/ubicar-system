"""
Tests de la guarda que decide si un mail sale, no sale, o no se intenta.

Es la regla menos obvia del módulo de emails y la que más caro sale si falla
en cualquiera de las dos direcciones:

- Si deja pasar un mail a un cliente con el remitente de prueba, el sistema
  registra "enviado" y el cliente no recibe nada. Eso es peor que no mandarlo:
  nadie va a ir a buscar el problema.
- Si frena de más, el equipo deja de recibir los avisos internos y las
  reservas web se quedan sin atender.

Corren sin base: `registrar_y_enviar` sólo usa `db.add` y `db.flush`, así que
una sesión de mentira alcanza y el test no depende de Postgres ni de Resend.
"""
from types import SimpleNamespace

import pytest

from app.services import email_service as mod
from app.services.email_service import EmailService
from app.services.notificaciones import ResultadoEnvio


class SesionFalsa:
    """Lo mínimo que usa `registrar_y_enviar`."""

    def __init__(self):
        self.agregados = []

    def add(self, obj):
        self.agregados.append(obj)

    def flush(self):
        pass


@pytest.fixture
def svc(monkeypatch):
    servicio = EmailService(SesionFalsa())
    # Sin datos de empresa: la plantilla no se toca en estos tests, y leerlos
    # requeriría base.
    monkeypatch.setattr(EmailService, "_empresa", lambda self: {})
    return servicio


def _remitente(monkeypatch, valor: str):
    monkeypatch.setattr(mod.settings, "from_email", valor)


def _espiar_envio(monkeypatch, resultado=ResultadoEnvio(ok=True, proveedor_id="re_123")):
    """Reemplaza el envío real y registra si se llamó."""
    llamadas = []

    def falso(destinatario, asunto, html, adjuntos=None):
        llamadas.append({"destinatario": destinatario, "asunto": asunto, "adjuntos": adjuntos})
        return resultado

    monkeypatch.setattr(mod, "enviar_email", falso)
    return llamadas


class TestRemitenteDePrueba:
    def test_reconoce_el_remitente_compartido_de_resend(self, svc, monkeypatch):
        _remitente(monkeypatch, "onboarding@resend.dev")
        assert svc.remitente_de_prueba

    def test_no_se_confunde_con_un_dominio_propio(self, svc, monkeypatch):
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        assert not svc.remitente_de_prueba

    def test_ignora_mayusculas_y_espacios(self, svc, monkeypatch):
        _remitente(monkeypatch, "  Onboarding@Resend.DEV ")
        assert svc.remitente_de_prueba


class TestGuardaDeCliente:
    def test_con_remitente_de_prueba_el_mail_al_cliente_no_se_intenta(self, svc, monkeypatch):
        _remitente(monkeypatch, "onboarding@resend.dev")
        llamadas = _espiar_envio(monkeypatch)

        registro = svc.registrar_y_enviar(
            tipo="checkin", destinatario="cliente@ejemplo.com", asunto="Cierre", html="<p>x</p>"
        )

        assert llamadas == []                       # no se tocó Resend
        assert registro.estado == "omitido"
        # El motivo tiene que nombrar el remitente: sin eso, "omitido" no le
        # dice nada a quien mira el panel.
        assert "onboarding@resend.dev" in registro.motivo
        assert "FROM_EMAIL" in registro.motivo

    def test_el_aviso_interno_se_manda_igual(self, svc, monkeypatch):
        # Al equipo se le intenta siempre: su casilla puede ser la de la cuenta,
        # y si no lo es queda `fallido` con el error, que es información.
        _remitente(monkeypatch, "onboarding@resend.dev")
        llamadas = _espiar_envio(monkeypatch)

        registro = svc.registrar_y_enviar(
            tipo="reserva_web_equipo", destinatario="equipo@ubicarrent.com", asunto="Nueva", html="x"
        )

        assert len(llamadas) == 1
        assert registro.estado == "enviado"

    def test_forzar_saltea_la_guarda(self, svc, monkeypatch):
        _remitente(monkeypatch, "onboarding@resend.dev")
        llamadas = _espiar_envio(monkeypatch)

        registro = svc.registrar_y_enviar(
            tipo="oferta", destinatario="cliente@ejemplo.com", asunto="Promo", html="x", forzar=True
        )

        assert len(llamadas) == 1
        assert registro.estado == "enviado"

    def test_con_dominio_propio_el_cliente_recibe(self, svc, monkeypatch):
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        llamadas = _espiar_envio(monkeypatch)

        registro = svc.registrar_y_enviar(
            tipo="reserva_confirmada", destinatario="cliente@ejemplo.com", asunto="Ok", html="x"
        )

        assert len(llamadas) == 1
        assert registro.estado == "enviado"
        assert registro.proveedor_id == "re_123"


class TestTolerancia:
    def test_una_falla_de_resend_queda_registrada_y_no_levanta(self, svc, monkeypatch):
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        _espiar_envio(monkeypatch, ResultadoEnvio(ok=False, error="Timeout"))

        registro = svc.registrar_y_enviar(
            tipo="checkout", destinatario="cliente@ejemplo.com", asunto="Retiro", html="x"
        )

        assert registro.estado == "fallido"
        assert registro.motivo == "Timeout"

    def test_una_excepcion_inesperada_tampoco_levanta(self, svc, monkeypatch):
        # El check-out ya ocurrió: el auto salió. Nada de lo que pase con el
        # mail puede volverse un error del check-out.
        _remitente(monkeypatch, "reservas@ubicarrent.com")

        def explota(*args, **kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(mod, "enviar_email", explota)

        registro = svc.registrar_y_enviar(
            tipo="checkout", destinatario="cliente@ejemplo.com", asunto="Retiro", html="x"
        )

        assert registro.estado == "fallido"
        assert "boom" in registro.motivo

    def test_sin_destinatario_no_registra_nada(self, svc, monkeypatch):
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        llamadas = _espiar_envio(monkeypatch)

        assert svc.registrar_y_enviar(tipo="checkin", destinatario=None, asunto="x", html="x") is None
        assert svc.registrar_y_enviar(tipo="checkin", destinatario="   ", asunto="x", html="x") is None
        assert llamadas == []


class TestOferta:
    def test_manda_uno_por_destinatario_y_sin_repetir(self, svc, monkeypatch):
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        llamadas = _espiar_envio(monkeypatch)

        registros = svc.enviar_oferta(
            destinatarios=["a@x.com", "b@x.com", "a@x.com", "  "],
            titulo="15% en agosto",
            cuerpo="Aprovechá.",
        )

        assert len(registros) == 2
        assert [c["destinatario"] for c in llamadas] == ["a@x.com", "b@x.com"]

    def test_rechaza_un_asunto_vacio(self, svc, monkeypatch):
        from app.core.exceptions import BusinessRuleError

        _remitente(monkeypatch, "reservas@ubicarrent.com")
        with pytest.raises(BusinessRuleError):
            svc.enviar_oferta(destinatarios=["a@x.com"], titulo="   ", cuerpo="Hola")

    def test_rechaza_una_lista_sin_nadie(self, svc, monkeypatch):
        from app.core.exceptions import BusinessRuleError

        _remitente(monkeypatch, "reservas@ubicarrent.com")
        with pytest.raises(BusinessRuleError):
            svc.enviar_oferta(destinatarios=["", "  "], titulo="Promo", cuerpo="Hola")


class TestReserva:
    def test_no_se_confirma_una_reserva_que_quedo_sin_cupo(self, svc, monkeypatch):
        # Decirle "confirmada" a alguien a quien no le podemos dar un auto es
        # peor que no escribirle.
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        llamadas = _espiar_envio(monkeypatch)
        reserva = SimpleNamespace(id=7, estado="revision_sin_cupo")

        assert svc.enviar_reserva_confirmada(reserva) is None
        assert llamadas == []


class TestAvisarPostCommit:
    """
    `EmailService.avisar` es lo que llaman los routers después del commit.

    Su contrato entero es "no puede levantar nunca": si levantara, el
    check-out ya persistido devolvería un 500 y el mostrador creería que la
    entrega no se registró.
    """

    def _sesion(self):
        class S(SesionFalsa):
            def __init__(self):
                super().__init__()
                self.commits = 0
                self.rollbacks = 0

            def commit(self):
                self.commits += 1

            def rollback(self):
                self.rollbacks += 1

        return S()

    def test_un_evento_desconocido_no_levanta(self):
        db = self._sesion()
        EmailService.avisar(db, "evento_que_no_existe", SimpleNamespace(id=1))
        assert db.rollbacks == 1
        assert db.commits == 0

    def test_una_entidad_rota_no_levanta(self, monkeypatch):
        # Un alquiler sin reserva hace explotar la plantilla. El check-in ya
        # ocurrió: eso no puede volverse un error de la operación.
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        db = self._sesion()
        EmailService.avisar(db, "checkin", SimpleNamespace(id=1))
        assert db.rollbacks == 1

    def test_el_camino_feliz_commitea(self, monkeypatch):
        _remitente(monkeypatch, "reservas@ubicarrent.com")
        _espiar_envio(monkeypatch)
        monkeypatch.setattr(EmailService, "_empresa", lambda self: {})
        db = self._sesion()
        # Una reserva pendiente no se confirma por mail, pero recorre el
        # camino completo sin romperse y commitea igual.
        EmailService.avisar(db, "reserva_confirmada", SimpleNamespace(id=1, estado="pendiente"))
        assert db.commits == 1
        assert db.rollbacks == 0


class TestCatalogoDeTipos:
    def test_todo_tipo_que_va_al_cliente_esta_en_el_catalogo(self):
        # Un tipo fuera de TIPOS queda sin nombre en el panel.
        assert mod.TIPOS_AL_CLIENTE <= set(mod.TIPOS)
