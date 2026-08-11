"""
Reservar por transferencia no puede exigir una pasarela de pago.

La transferencia bancaria existe **justamente porque todavía no hay Mercado
Pago**: se creó para poder vender mientras faltan las credenciales. Pero
`PagoWebService` resolvía la pasarela en el constructor, así que instanciarlo
—incluso para el camino que no la usa— levantaba `PasarelaNoConfigurada` en
producción.

Resultado: la web devolvía 500 al apretar "pagar con transferencia", y como un
500 sin manejar sale por fuera del middleware de CORS, **el navegador lo
reportaba como un error de CORS**. Dos horas buscando un problema de headers
que no existía.
"""
import pytest

from app.adapters.pagos.interface import PasarelaNoConfigurada
from app.services.pago_web_service import PagoWebService


class PasarelaRota:
    """Falla si alguien la toca. Sirve para probar que NO se toca."""
    def crear_preferencia(self, *a, **k):
        raise AssertionError("no deberia usarse")

    def obtener_pago(self, *a, **k):
        raise AssertionError("no deberia usarse")


class TestPasarelaPerezosa:
    def test_se_puede_construir_sin_pasarela_configurada(self, monkeypatch):
        """El constructor no puede depender de Mercado Pago: es lo que rompía
        el camino de transferencia."""
        def explota():
            raise PasarelaNoConfigurada("sin credenciales")

        monkeypatch.setattr(
            "app.services.pago_web_service.get_pasarela", explota
        )
        # No levanta: la pasarela se resuelve recién al usarla.
        PagoWebService(db=None)

    def test_pedirla_explicitamente_si_falla(self, monkeypatch):
        """Cuando de verdad hace falta —el checkout de Mercado Pago— el error
        tiene que aparecer, no quedar escondido."""
        def explota():
            raise PasarelaNoConfigurada("sin credenciales")

        monkeypatch.setattr(
            "app.services.pago_web_service.get_pasarela", explota
        )
        svc = PagoWebService(db=None)
        with pytest.raises(PasarelaNoConfigurada):
            _ = svc.pasarela

    def test_la_inyectada_gana_y_no_se_resuelve_ninguna(self, monkeypatch):
        """Los tests del webhook pasan la suya: no puede intentar resolver la
        real ni una vez."""
        monkeypatch.setattr(
            "app.services.pago_web_service.get_pasarela",
            lambda: (_ for _ in ()).throw(AssertionError("no deberia llamarse")),
        )
        propia = PasarelaRota()
        assert PagoWebService(db=None, pasarela=propia).pasarela is propia
