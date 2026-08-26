"""
Las tres coberturas llegan al contrato con su nombre y su asterisco.

El clausulado v2 define `Mid Cover*`, `Top Cover**` y `Super Top Cover***`, y el
anverso imprime la contratada con **el mismo asterisco**. Ese par es todo el
mecanismo: el cliente lee un nombre arriba y sabe a qué cláusula ir. Si el
asterisco no viaja en el snapshot, el anverso imprime un nombre suelto y la
cláusula queda hablando de algo que el papel no nombra — que es exactamente lo
que pasaba antes, cuando el clausulado no nombraba ninguna cobertura.

Se prueba el bloque armado y no el PDF: el PDF es dibujo, el bloque es el dato
que se congela y que se va a reimprimir dentro de dos años.
"""
from decimal import Decimal

import pytest

from app.domain import contrato_clausulado
from app.models.adicional import Adicional, ReservaAdicional
from app.models.categoria import Categoria
from app.services.contrato_service import ContratoService


@pytest.fixture()
def catalogo(db):
    """Las tres coberturas con los códigos que siembra la migración 085."""
    mid = Adicional(
        codigo="cobertura_mid", nombre="Mid Cover", grupo="cobertura",
        precio=Decimal("0"), unidad_cobro="unico",
        porcentaje_sobre_alquiler=Decimal("0"), franquicia_descuento=None,
        incluido=True, activo=True,
    )
    top = Adicional(
        codigo="cobertura_top", nombre="Top Cover", grupo="cobertura",
        precio=Decimal("0"), unidad_cobro="unico",
        porcentaje_sobre_alquiler=Decimal("10"),
        franquicia_descuento=Decimal("500000"), activo=True,
    )
    super_top = Adicional(
        codigo="cobertura_super_top", nombre="Super Top Cover", grupo="cobertura",
        precio=Decimal("0"), unidad_cobro="unico",
        porcentaje_sobre_alquiler=Decimal("30"),
        franquicia_descuento=Decimal("1000000"), activo=True,
    )
    db.add_all([mid, top, super_top])
    db.flush()
    return {"mid": mid, "top": top, "super_top": super_top}


@pytest.fixture()
def armar(db, vehiculo, hacer_reserva, catalogo):
    def _armar(cobertura: Adicional | None, base="3000000"):
        cat = Categoria(
            codigo="CATPU", nombre="Pick-up", franquicia_base=Decimal(base),
        )
        db.add(cat)
        db.flush()
        vehiculo.categoria_id = cat.id
        reserva = hacer_reserva(precio_total="400000", estado="confirmada")
        if cobertura is not None:
            db.add(ReservaAdicional(
                reserva_id=reserva.id, adicional_id=cobertura.id,
                cantidad=1, precio_unitario=Decimal("0"),
                unidad_cobro="unico", subtotal=Decimal("0"),
            ))
        db.flush()
        db.refresh(reserva)
        return reserva
    return _armar


class TestElAsteriscoLlegaAlPapel:
    @pytest.mark.parametrize(
        "clave, nombre, marca",
        [
            ("mid", "Mid Cover", "*"),
            ("top", "Top Cover", "**"),
            ("super_top", "Super Top Cover", "***"),
        ],
    )
    def test_cada_cobertura_viaja_con_su_marca(
        self, db, catalogo, armar, clave, nombre, marca
    ):
        reserva = armar(catalogo[clave])
        bloque = ContratoService(db)._bloque_coberturas(reserva)

        contratada = bloque["contratadas"][0]
        assert contratada["nombre"] == nombre
        assert contratada["marca"] == marca

    def test_una_cobertura_de_otro_codigo_no_inventa_asterisco(self, db, armar):
        """
        Un asterisco que no lleva a ninguna cláusula es peor que ninguno: el
        cliente lo busca en el reverso y no lo encuentra.
        """
        otra = Adicional(
            codigo="cobertura_inventada", nombre="Cobertura X", grupo="cobertura",
            precio=Decimal("0"), unidad_cobro="unico",
            franquicia_descuento=Decimal("500000"), activo=True,
        )
        db.add(otra)
        db.flush()

        bloque = ContratoService(db)._bloque_coberturas(armar(otra))
        assert bloque["contratadas"][0]["marca"] == ""


class TestLoQueSeOfrecioYSeRechazo:
    def test_la_incluida_nunca_figura_como_rechazada(self, db, catalogo, armar):
        """
        Mid Cover viene en el precio. "A pesar de la explicación no desea
        contratar Mid Cover" en un contrato donde Mid Cover está incluida es
        una contradicción escrita, y es la línea con la que un cliente discute
        que no tenía nada.
        """
        bloque = ContratoService(db)._bloque_coberturas(armar(catalogo["top"]))
        assert "Mid Cover" not in bloque["rechazadas"]
        assert "Super Top Cover" in bloque["rechazadas"]


class TestSoloLaIncluidaNoSeOfrece:
    """
    La 085 renombró la cobertura del +10 % a "Top Cover" sin tocar `incluido`,
    que en producción venía en `true`. `incluido` saca la cobertura de la lista
    de rechazadas del contrato, así que un cliente que decía que no a Top Cover
    firmaba un papel **sin constancia de que se le ofreció** — la línea que se
    mira cuando alguien choca y sostiene que nunca le ofrecieron nada.

    El precio seguía bien, que es lo que lo hacía difícil de ver.
    """

    def test_top_cover_rechazada_figura_en_el_contrato(self, db, catalogo, armar):
        bloque = ContratoService(db)._bloque_coberturas(armar(catalogo["super_top"]))
        assert "Top Cover" in bloque["rechazadas"]

    def test_una_cobertura_incluida_no_puede_bajar_la_franquicia(self, db, catalogo):
        """
        Las dos cosas a la vez no significan nada: la incluida ES la base. Es
        la validación que hubiera atajado el error antes de que llegara a un
        contrato firmado.
        """
        from app.routers.adicionales import _validar_franquicia
        from fastapi import HTTPException

        top = catalogo["top"]
        top.incluido = True
        db.flush()

        with pytest.raises(HTTPException) as e:
            _validar_franquicia(db, top)
        assert e.value.status_code == 422


class TestLaFranquiciaNoEsUnCargo:
    def test_no_baja_de_500000_ni_con_la_mas_cara(self, db, catalogo, armar):
        """
        No existe la cobertura total. Sobre la base más baja, el escalón más
        grande toca el piso y se queda ahí.
        """
        reserva = armar(catalogo["super_top"], base="1500000")
        bloque = ContratoService(db)._bloque_coberturas(reserva)
        assert bloque["franquicia"] == 500_000

    def test_la_incluida_deja_la_base_entera(self, db, catalogo, armar):
        reserva = armar(catalogo["mid"], base="3000000")
        bloque = ContratoService(db)._bloque_coberturas(reserva)
        assert bloque["franquicia"] == 3_000_000
        # No descuenta nada, así que el anverso no imprime un "baja la
        # franquicia en $ 0" que se leería como un error de carga.
        assert bloque["contratadas"][0]["descuento"] is None


class TestElClausuladoNombraLoQueElAnversoImprime:
    def test_las_tres_coberturas_estan_definidas_en_la_clausula_5(self):
        c5 = [c for c in contrato_clausulado.CLAUSULAS if c["numero"] == 5][0]
        texto = " ".join(p["texto"] for p in c5["parrafos"])
        for nombre in ("Mid Cover", "Top Cover", "Super Top Cover"):
            assert nombre in texto

    def test_ruedas_y_vidrios_se_excluye_y_se_ofrece_aparte(self):
        c5 = [c for c in contrato_clausulado.CLAUSULAS if c["numero"] == 5][0]
        texto = " ".join(p["texto"] for p in c5["parrafos"])
        assert "Ruedas y Vidrios" in texto
        assert "Protección Ruedas y Vidrios" in texto

    def test_el_clausulado_no_promete_franquicia_cero_ni_cobertura_total(self):
        """
        Las frases que el contrato modelo trae y que acá serían falsas:
        `FRANQUICIA_MINIMA` no deja bajar de $500.000, así que ni "Reducción de
        la Franquicia a CERO" ni "cobertura a todo riesgo" pueden aparecer.

        Se buscan las frases y no la palabra "cero" suelta: "terceros" la
        contiene, y "Seguro a terceros" tiene que poder seguir escribiéndose.
        """
        texto = " ".join(
            p["texto"]
            for c in contrato_clausulado.CLAUSULAS
            for p in c["parrafos"]
        ).lower()
        assert "franquicia a cero" in texto, "la negación tiene que estar escrita"
        assert "ninguna de las tres reduce la franquicia a cero" in texto
        assert "reducción de la franquicia a cero" not in texto
        assert "todo riesgo" not in texto
        assert "cobertura total" not in texto

    def test_los_subrayados_caen_dentro_del_parrafo(self):
        """
        Un subrayado fuera de rango no rompe nada al generar: recorta solo y
        marca el pasaje equivocado. Por eso se chequea acá y no en el PDF.
        """
        for c in contrato_clausulado.CLAUSULAS:
            for p in c["parrafos"]:
                for inicio, fin in p["subrayados"]:
                    assert 0 <= inicio < fin <= len(p["texto"]), (
                        f"cláusula {c['numero']}: subrayado [{inicio}, {fin}] "
                        f"fuera de un párrafo de {len(p['texto'])} caracteres"
                    )
