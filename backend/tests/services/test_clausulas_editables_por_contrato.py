"""
Las cláusulas del contrato se pueden editar ANTES de generarlo (04/10/2026).

*"deberíamos poder modificar alguna cláusula del contrato en caso de quererlo,
se sigue generando igual, pero antes de generarlo tiene que haber una pantalla
para editar algo."*

El contrato guarda las cláusulas **sólo si cambiaron**: uno sin cambios sigue
atado a su plantilla; uno con cambios congela el texto que se firmó.
"""
import pytest

from app.core.exceptions import BusinessRuleError
from app.domain import contrato_clausulado as cc
from app.services.contrato_service import ContratoService


@pytest.fixture()
def reserva(hacer_reserva):
    return hacer_reserva(precio_total="400000", estado="confirmada")


def _editar_la_3(clausulas, texto):
    editadas = [dict(c, parrafos=[dict(p) for p in c["parrafos"]]) for c in clausulas]
    c3 = next(c for c in editadas if c["numero"] == 3)
    c3["parrafos"][0]["texto"] = texto
    return editadas


class TestPreparar:
    def test_trae_las_clausulas_vigentes_para_poder_editarlas(self, db, reserva):
        datos = ContratoService(db).preparar(reserva.id)
        assert datos["clausulas"], "la pantalla de revisión necesita el texto"
        assert [c["numero"] for c in datos["clausulas"]][:3] == [1, 2, 3]


class TestCrear:
    def test_sin_cambios_no_guarda_las_clausulas(self, db, reserva, usuario):
        """Sigue siendo 'el de la versión N': se reimprime con su plantilla."""
        svc = ContratoService(db)
        contrato = svc.crear(reserva.id, svc.preparar(reserva.id), usuario.id)
        assert "clausulas" not in contrato.snapshot
        assert "clausulas_modificadas" not in contrato.snapshot

    def test_con_cambios_las_congela_y_dice_cuales(self, db, reserva, usuario):
        svc = ContratoService(db)
        datos = svc.preparar(reserva.id)
        datos["clausulas"] = _editar_la_3(datos["clausulas"], "Texto pactado con el cliente.")
        contrato = svc.crear(reserva.id, datos, usuario.id)

        assert contrato.snapshot["clausulas_modificadas"] == [3]
        c3 = next(c for c in contrato.snapshot["clausulas"] if c["numero"] == 3)
        assert c3["parrafos"][0]["texto"] == "Texto pactado con el cliente."

    def test_lo_firmado_no_cambia_si_la_plantilla_cambia_despues(self, db, reserva, usuario):
        svc = ContratoService(db)
        datos = svc.preparar(reserva.id)
        datos["clausulas"] = _editar_la_3(datos["clausulas"], "Texto pactado.")
        contrato = svc.crear(reserva.id, datos, usuario.id)

        svc.nueva_version(clausulas=[{"numero": 1, "titulo": "Otra", "parrafos": [{"texto": "x"}]}],
                          titulo="Otro título", usuario_id=usuario.id)
        db.refresh(contrato)
        assert any(c["numero"] == 3 for c in contrato.snapshot["clausulas"])

    def test_un_clausulado_mal_formado_se_rechaza_antes_de_guardar(self, db, reserva, usuario):
        svc = ContratoService(db)
        datos = svc.preparar(reserva.id)
        datos["clausulas"] = [{"numero": 1, "titulo": "Sin párrafos"}]
        with pytest.raises(BusinessRuleError) as e:
            svc.crear(reserva.id, datos, usuario.id)
        assert "clausulas_invalidas" in str(e.value)


class TestPdf:
    def test_el_pdf_se_genera_con_las_clausulas_editadas(self, db, reserva, usuario):
        svc = ContratoService(db)
        datos = svc.preparar(reserva.id)
        datos["clausulas"] = _editar_la_3(datos["clausulas"], "Texto pactado.")
        contrato = svc.crear(reserva.id, datos, usuario.id)
        pdf = svc.generar_pdf(contrato.id)
        assert pdf.startswith(b"%PDF")


class TestDominio:
    def test_un_parrafo_en_blanco_no_se_imprime(self):
        limpias = cc.validar_clausulas([
            {"numero": 1, "titulo": "T", "parrafos": [{"texto": "a"}, {"texto": "   "}]},
        ])
        assert [p["texto"] for p in limpias[0]["parrafos"]] == ["a"]

    def test_agregar_o_quitar_una_clausula_cuenta_como_modificada(self):
        base = [{"numero": 1, "titulo": "A", "parrafos": [{"texto": "x"}]}]
        mas = base + [{"numero": 2, "titulo": "B", "parrafos": [{"texto": "y"}]}]
        assert cc.clausulas_modificadas(mas, base) == [2]
        assert cc.clausulas_modificadas(base, mas) == [2]
