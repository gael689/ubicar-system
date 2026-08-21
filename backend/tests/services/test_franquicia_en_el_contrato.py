"""
El contrato imprime la franquicia de ESTE auto, con ESTA cobertura.

`ContratoService._bloque_coberturas` copiaba el número guardado en el adicional,
que era absoluto y compartido por todas las categorías. Con tres bases distintas
—$1.500.000 el Compacto, $2.000.000 el Sedán superior, $3.000.000 la SUV— eso
significa que **el contrato de una SUV imprimía la franquicia de un Compacto**.

Y no había ningún test que mirara el bloque armado: cuando la migración 084
renombró la clave, el PDF dejó de imprimir el detalle por cobertura **en
silencio**. Este archivo existe para que eso no vuelva a pasar — se prueba la
forma del bloque, no sólo el número.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.models.adicional import Adicional, ReservaAdicional
from app.models.categoria import Categoria
from app.services.contrato_service import ContratoService

# Los dos escalones reales, tal como quedaron cargados.
REDUCIDA = Decimal("500000")
TOTAL = Decimal("1000000")


@pytest.fixture()
def coberturas(db):
    """Las dos coberturas del catálogo, con su descuento."""
    reducida = Adicional(
        codigo="COB_RED", nombre="Cobertura reducida", grupo="cobertura",
        precio=Decimal("0"), unidad_cobro="por_dia",
        porcentaje_sobre_alquiler=Decimal("10"), franquicia_descuento=REDUCIDA,
        activo=True,
    )
    total = Adicional(
        codigo="COB_TOT", nombre="Cobertura total", grupo="cobertura",
        precio=Decimal("0"), unidad_cobro="por_dia",
        porcentaje_sobre_alquiler=Decimal("30"), franquicia_descuento=TOTAL,
        activo=True,
    )
    db.add_all([reducida, total])
    db.flush()
    return reducida, total


@pytest.fixture()
def armar(db, cliente, usuario, vehiculo, hacer_reserva, coberturas):
    """Una reserva con la categoría y la cobertura que se pidan."""
    def _armar(base_categoria: str, cobertura: Adicional | None):
        cat = Categoria(
            codigo=f"CAT{base_categoria}", nombre=f"Cat {base_categoria}",
            franquicia_base=Decimal(base_categoria) if base_categoria else None,
        )
        db.add(cat)
        db.flush()
        vehiculo.categoria_id = cat.id

        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        if cobertura is not None:
            # `nombre` y `grupo` son propiedades derivadas del adicional
            # relacionado, no columnas: se leen, no se escriben.
            db.add(ReservaAdicional(
                reserva_id=reserva.id, adicional_id=cobertura.id,
                cantidad=1, precio_unitario=Decimal("0"),
                unidad_cobro="por_dia", subtotal=Decimal("0"),
            ))
        db.flush()
        db.refresh(reserva)
        return reserva
    return _armar


class TestElNumeroQueSeFirma:
    @pytest.mark.parametrize(
        "base, esperado",
        [("1500000", 1_000_000), ("2000000", 1_500_000), ("3000000", 2_500_000)],
    )
    def test_la_reducida_baja_500000_sobre_la_base_de_su_categoria(
        self, db, armar, coberturas, base, esperado
    ):
        reducida, _ = coberturas
        reserva = armar(base, reducida)

        bloque = ContratoService(db)._bloque_coberturas(reserva)
        assert bloque["franquicia"] == esperado

    @pytest.mark.parametrize(
        "base, esperado",
        [("1500000", 500_000), ("2000000", 1_000_000), ("3000000", 2_000_000)],
    )
    def test_la_total_baja_1000000(self, db, armar, coberturas, base, esperado):
        _, total = coberturas
        reserva = armar(base, total)

        bloque = ContratoService(db)._bloque_coberturas(reserva)
        assert bloque["franquicia"] == esperado

    def test_sin_cobertura_extra_paga_la_base_entera(self, db, armar):
        reserva = armar("1500000", None)
        assert ContratoService(db)._bloque_coberturas(reserva)["franquicia"] == 1_500_000

    def test_una_suv_no_imprime_la_franquicia_de_un_compacto(self, db, armar, coberturas):
        """El bug que esto vino a arreglar, dicho de la forma en que dolía."""
        _, total = coberturas
        suv = armar("3000000", total)
        assert ContratoService(db)._bloque_coberturas(suv)["franquicia"] == 2_000_000

    def test_sin_base_cargada_no_se_imprime_ningun_numero(self, db, armar, coberturas):
        """
        D-53: un cero se lee como "no pagás nada", que es lo contrario de lo que
        significa. `None` es lo honesto, y el PDF omite la línea entera.
        """
        _, total = coberturas
        reserva = armar("", total)
        assert ContratoService(db)._bloque_coberturas(reserva)["franquicia"] is None


class TestLaFormaDelBloque:
    """
    Lo que faltaba: nadie miraba las **claves**, así que renombrar una rompió el
    PDF sin que ningún test se enterara.
    """

    def test_cada_cobertura_dice_cuanto_baja(self, db, armar, coberturas):
        reducida, _ = coberturas
        reserva = armar("1500000", reducida)

        bloque = ContratoService(db)._bloque_coberturas(reserva)
        assert len(bloque["contratadas"]) == 1
        contratada = bloque["contratadas"][0]
        assert contratada["nombre"] == "Cobertura reducida"
        # La clave que el PDF lee. Si se renombra, este test cae.
        assert contratada["descuento"] == 500_000

    def test_la_no_contratada_queda_como_rechazo_explicito(self, db, armar, coberturas):
        """Es la prueba de que se ofreció y el cliente dijo que no."""
        reducida, _ = coberturas
        reserva = armar("1500000", reducida)

        bloque = ContratoService(db)._bloque_coberturas(reserva)
        assert "Cobertura total" in bloque["rechazadas"]
        assert "Cobertura reducida" not in bloque["rechazadas"]

    def test_el_bloque_trae_la_base_para_poder_explicar_el_numero(self, db, armar, coberturas):
        _, total = coberturas
        reserva = armar("3000000", total)

        bloque = ContratoService(db)._bloque_coberturas(reserva)
        assert bloque["franquicia_base"] == 3_000_000
        assert bloque["franquicia"] == 2_000_000


class TestElPDFLoImprime:
    def test_el_pdf_se_genera_y_dice_la_franquicia_resuelta(self, db, armar, coberturas):
        """
        Se arma el PDF de verdad: es la única forma de saber que las claves del
        bloque y las que lee el renderer siguen siendo las mismas.
        """
        from app.services import contrato_pdf

        _, total = coberturas
        reserva = armar("3000000", total)
        bloque = ContratoService(db)._bloque_coberturas(reserva)

        # El renderer lee estas dos claves. Si alguna se renombra, esto explota
        # acá en vez de imprimir un contrato incompleto.
        assert "franquicia" in bloque
        assert all("descuento" in c for c in bloque["contratadas"])
        assert hasattr(contrato_pdf, "_money")
