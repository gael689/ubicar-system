"""
El clausulado completo entra en el reverso del contrato.

El reverso es **una página, a dos columnas**, y cuando el texto no entra el
generador corta en silencio: no da error, imprime un contrato al que le falta
el final. Agregar una cláusula (la 14, "Franquicia como garantía") es
justamente el cambio que lo puede provocar, así que se fija acá: la última
línea de cada cláusula tiene que estar impresa.
"""
import io
import re
from datetime import date
from types import SimpleNamespace

import pytest

pypdf = pytest.importorskip("pypdf")

from app.domain import contrato_clausulado as cc  # noqa: E402
from app.services.contrato_pdf import generar_pdf_contrato  # noqa: E402
from tests.domain.test_contrato_pdf_layout import EMPRESA_REAL, _contrato  # noqa: E402


def _normalizar(texto: str) -> str:
    return re.sub(r"\s+", "", texto)


@pytest.fixture(scope="module")
def reverso() -> str:
    plantilla = SimpleNamespace(
        titulo=cc.TITULO, clausulas=cc.CLAUSULAS, version=cc.VERSION,
        vigente_desde=date(2026, 9, 23),
    )
    pdf = generar_pdf_contrato(_contrato(EMPRESA_REAL), plantilla)
    lector = pypdf.PdfReader(io.BytesIO(pdf))
    return _normalizar(lector.pages[1].extract_text())


def test_cada_clausula_esta_impresa_hasta_el_final(reverso):
    for c in cc.CLAUSULAS:
        assert _normalizar(f"{c['numero']}. {c['titulo']}".replace("{{LOCADOR}}", "")) [:20] in reverso, c["numero"]
        ultimo = c["parrafos"][-1]["texto"]
        # Los marcadores ({{LOCADOR}}…) se reemplazan al imprimir: se comparan
        # las últimas palabras que no dependen de la empresa.
        sin_marcas = re.sub(r"\{\{\w+\}\}", "", ultimo).split()
        final = _normalizar(" ".join(sin_marcas[-2:]).strip(".,"))
        assert final in reverso, f"la cláusula {c['numero']} se cortó antes de «{ultimo[-30:]}»"


def test_la_clausula_de_la_franquicia_esta_y_dice_que_es_garantia():
    c14 = next(c for c in cc.CLAUSULAS if c["numero"] == 14)
    texto = " ".join(p["texto"] for p in c14["parrafos"])
    assert "Franquicia" in c14["titulo"]
    assert "garantía" in texto and "anexa" in texto and "misma firma" in texto


def test_el_clausulado_subio_de_version():
    """Un contrato ya firmado se reimprime con el texto con que se firmó; el nuevo, con la v4."""
    assert cc.VERSION >= 4
