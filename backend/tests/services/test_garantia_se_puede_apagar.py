"""
Apagar la garantía apaga también su advertencia.

El bloque "Garantía / Depósito" del formulario se oculta con
`reservas.pide_garantia`. Si sólo se escondiera el bloque, ninguna reserva
podría tener garantía cargada y el semáforo pondría `sin_garantia` en
**todas**, para siempre y sin forma de resolverla.

Una advertencia que está siempre encendida no avisa de nada: enseña a ignorar
la lista entera, que es exactamente lo que el semáforo evita separando
bloqueantes de avisos.
"""
import pytest

from app.domain.bloqueos import CLAVE_PIDE_GARANTIA, evaluar_datos_pre_checkout
from app.models.configuracion import Configuracion


def codigos(items):
    return {i.codigo for i in items}


def poner(db, valor: str):
    db.add(Configuracion(
        clave=CLAVE_PIDE_GARANTIA, valor=valor, tipo="bool",
        descripcion="test", categoria="reservas",
    ))
    db.flush()


class TestConLaGarantiaApagada:
    def test_no_reclama_la_garantia(self, db):
        poner(db, "false")
        _, items = evaluar_datos_pre_checkout(db, garantia_tipo=None)
        assert "sin_garantia" not in codigos(items)

    def test_tampoco_con_no_aplica(self, db):
        poner(db, "false")
        _, items = evaluar_datos_pre_checkout(db, garantia_tipo="no_aplica")
        assert "sin_garantia" not in codigos(items)


class TestConLaGarantiaPrendida:
    def test_la_reclama_igual_que_antes(self, db):
        poner(db, "true")
        _, items = evaluar_datos_pre_checkout(db, garantia_tipo=None)
        assert "sin_garantia" in codigos(items)

    def test_sin_la_fila_cargada_se_comporta_como_siempre(self, db):
        """
        El default es el comportamiento histórico: una instalación que no tenga
        la clave no cambia de conducta por este agregado.
        """
        _, items = evaluar_datos_pre_checkout(db, garantia_tipo=None)
        assert "sin_garantia" in codigos(items)

    def test_con_garantia_cargada_no_reclama_nada(self, db):
        poner(db, "true")
        _, items = evaluar_datos_pre_checkout(db, garantia_tipo="efectivo")
        assert "sin_garantia" not in codigos(items)


class TestElInterruptorNoSeCaeAlDefault:
    @pytest.mark.parametrize("valor", ["true", "1", "si", "sí", "on"])
    def test_las_formas_de_prender(self, db, valor):
        poner(db, valor)
        _, items = evaluar_datos_pre_checkout(db, garantia_tipo=None)
        assert "sin_garantia" in codigos(items)

    @pytest.mark.parametrize("valor", ["false", "0", "no", "cualquier cosa"])
    def test_cualquier_otra_cosa_es_apagado(self, db, valor):
        """
        **Un valor irreconocible no vuelve al default.** Si alguien escribió
        algo en la pantalla de Configuración quiso decir algo; caer al default
        haría parecer que la fila no existe y el interruptor no respondería.
        """
        poner(db, valor)
        _, items = evaluar_datos_pre_checkout(db, garantia_tipo=None)
        assert "sin_garantia" not in codigos(items)
