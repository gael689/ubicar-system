"""
La franquicia con el deudor elegible (plan 27/09, A5).

Antes el deudor era siempre el titular de la reserva y el papel decía "DNI"
para todos — una empresa salía con su CUIT rotulado como DNI. Ahora se elige
entre el cliente, su representante y cualquiera de los conductores, y los
datos los pone el servidor.
"""
from decimal import Decimal

import pytest

from app.core.exceptions import BusinessRuleError
from app.models.cliente import Cliente, ConductorAdicional
from app.services.contrato_service import ContratoService
from app.services.pagare_service import PagareService, tipo_documento
from tests.services.test_pagare import empresa_configurada  # noqa: F401  (fixture)


@pytest.fixture()
def empresa(db):
    c = Cliente(
        nombre_completo="Transportes del Sur S.A.", dni_cuit="30-71234567-8",
        telefono="2914000000", tipo="empresa", razon_social="Transportes del Sur S.A.",
        representante_nombre="Laura Díaz", representante_dni="28111222",
        representante_cargo="Apoderada",
    )
    db.add(c)
    db.flush()
    return c


@pytest.fixture()
def chofer(db, empresa):
    c = ConductorAdicional(cliente_id=empresa.id, nombre_completo="Pedro Chofer", dni="33444555")
    db.add(c)
    db.flush()
    return c


@pytest.fixture()
def contrato_empresa(db, usuario, hacer_reserva, empresa, chofer, empresa_configurada):  # noqa: F811
    reserva = hacer_reserva(precio_total="140000", cliente_id=empresa.id, conductor_id=chofer.id)
    c = ContratoService(db).crear(reserva.id, None, usuario.id)
    db.flush()
    return c


def test_tipo_de_documento():
    assert tipo_documento("30111222") == "DNI"
    assert tipo_documento("20-30111222-4") == "CUIT"
    assert tipo_documento("30111222", es_empresa=True) == "CUIT"


def test_preparar_ofrece_empresa_representante_y_conductor(db, contrato_empresa):
    datos = PagareService(db).preparar(contrato_empresa.reserva_id)
    tipos = [(p["tipo"], p["tipo_documento"]) for p in datos["deudores_posibles"]]
    assert tipos == [("cliente", "CUIT"), ("representante", "DNI"), ("conductor", "DNI")]
    assert datos["requiere_elegir_deudor"] is True


def test_la_empresa_como_deudor_se_rotula_cuit(db, usuario, contrato_empresa):
    p = PagareService(db).crear(contrato_empresa.reserva_id, monto=1000, codeudores=[], usuario_id=usuario.id)
    assert p.snapshot["deudor"]["tipo_documento"] == "CUIT"
    assert p.snapshot["deudor"]["nombre"] == "Transportes del Sur S.A."


def test_el_representante_como_deudor(db, usuario, contrato_empresa):
    p = PagareService(db).crear(
        contrato_empresa.reserva_id, monto=1000, codeudores=[], usuario_id=usuario.id,
        deudor={"tipo": "representante"},
    )
    assert p.snapshot["deudor"] == {
        "nombre": "Laura Díaz", "dni": "28111222", "domicilio": "",
        "tipo_documento": "DNI", "tipo": "representante",
    }


def test_un_conductor_como_deudor_y_no_puede_ser_su_propio_codeudor(db, usuario, contrato_empresa, chofer):
    p = PagareService(db).crear(
        contrato_empresa.reserva_id, monto=1000, usuario_id=usuario.id,
        deudor={"tipo": "conductor", "conductor_id": chofer.id},
        codeudores=[
            {"nombre": "Pedro Chofer", "dni": "33.444.555"},
            {"nombre": "Laura Díaz", "dni": "28111222"},
        ],
    )
    assert p.snapshot["deudor"]["nombre"] == "Pedro Chofer"
    assert [c["nombre"] for c in p.snapshot["codeudores"]] == ["Laura Díaz"]


def test_un_conductor_de_otro_cliente_no(db, usuario, contrato_empresa, cliente):
    ajeno = ConductorAdicional(cliente_id=cliente.id, nombre_completo="Ajeno", dni="1")
    db.add(ajeno)
    db.flush()
    with pytest.raises(BusinessRuleError, match="no es de este cliente"):
        PagareService(db).crear(
            contrato_empresa.reserva_id, monto=1000, codeudores=[], usuario_id=usuario.id,
            deudor={"tipo": "conductor", "conductor_id": ajeno.id},
        )


def test_el_pdf_dice_cuit_para_la_empresa(db, usuario, contrato_empresa):
    pypdf = pytest.importorskip("pypdf")
    import io

    from app.services.pagare_pdf import generar_pdf_pagare

    p = PagareService(db).crear(contrato_empresa.reserva_id, monto=1000, codeudores=[], usuario_id=usuario.id)
    texto = pypdf.PdfReader(io.BytesIO(generar_pdf_pagare(p))).pages[0].extract_text()
    assert "CUIT: 30-71234567-8" in texto
    assert "($ 1.000,00)" in texto.replace("\n", " ")


def test_un_pagare_viejo_sin_tipo_deduce_cuit_por_los_digitos():
    pypdf = pytest.importorskip("pypdf")
    import io
    from datetime import datetime
    from types import SimpleNamespace

    from app.services.pagare_pdf import generar_pdf_pagare

    viejo = SimpleNamespace(
        snapshot={
            "titulo": "FRANQUICIA", "lugar_emision": "Bahía Blanca", "monto_numerico": "1.000,00",
            "texto": "A la vista pagaré...", "deudor": {"nombre": "Empresa", "dni": "30712345678"},
            "codeudores": [], "empresa": {},
        },
        numero_formateado="P-00000001", firmado=False, firmado_at=None, fecha_generacion=datetime(2026, 9, 1),
        firmado_por_nombre=None, firmado_por_dni=None, firma_medio=None, anulado=False,
    )
    texto = pypdf.PdfReader(io.BytesIO(generar_pdf_pagare(viejo))).pages[0].extract_text()
    assert "CUIT: 30712345678" in texto
