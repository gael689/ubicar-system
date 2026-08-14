"""
Geometría del PDF del contrato: **ningún texto encima de otro texto.**

Es un test de invariante, no de píxeles. El bug que lo motivó no fue un error
de código sino un dato que creció: el pie dibujaba tres segmentos con
`drawString` / `drawCentredString` / `drawRightString` en la misma `y` y sin
declarar ancho, y cuando el domicilio real del locador (D-C1, agosto 2026)
reemplazó al placeholder corto, la cola de "…Provincia de Buenos Aires"
quedó impresa encima del teléfono.

Nada en el código había cambiado. Por eso lo que se afirma acá no es "el pie
mide tal cosa" sino **"dos textos en la misma línea no se superponen"**, con
los valores reales y con casos extremos: es lo único que sigue protegiendo
cuando alguien edite un dato desde Configuración.
"""
from datetime import date
from types import SimpleNamespace

import pytest

pypdf = pytest.importorskip("pypdf")

from app.services.contrato_pdf import generar_pdf_contrato  # noqa: E402


EMPRESA_REAL = {
    "razon_social": "FINAR GRUPO FINANCIERO S.R.L.",
    "locador_nombre": "FINAR GRUPO FINANCIERO S.R.L.",
    "domicilio": "Paraguay 241, Piso 9, Dpto. A",
    "localidad": "Bahia Blanca, Provincia de Buenos Aires",
    "telefonos": "+54 9 291 4180554",
    "email": "ubicar.rent@gmail.com",
    "cuit": "30-71756601-3",
    "ingresos_brutos": "30-71756601-3",
    "jurisdiccion": "Bahía Blanca",
}


def _snapshot(empresa: dict) -> dict:
    return {
        "empresa": empresa,
        "numero": "0001-00000001",
        "cliente": {"nombre_completo": "Juan Perez", "dni": "30111222"},
        "vehiculo": {"patente": "AB123CD", "marca": "Fiat", "modelo": "Cronos"},
        "reserva": {
            "fecha_inicio": "2026-08-15", "fecha_fin": "2026-08-20",
            "lugar_entrega": "Paraguay 241", "lugar_devolucion": "Paraguay 241",
        },
        "cargos": {
            "lineas": [
                {"concepto": "Alquiler", "cantidad": 5,
                 "valor_unitario": 20000, "valor_total": 100000},
            ],
            "valor_estimado": 100000,
        },
        "servicio": {"lugar_entrega": "Paraguay 241", "lugar_devolucion": "Paraguay 241"},
        "coberturas": {},
        "atendido_por": "Dev Admin",
    }


def _contrato(empresa: dict):
    return SimpleNamespace(
        snapshot=_snapshot(empresa),
        numero_formateado="0001-00000001",
        firmado_at=None,
        firmado_por_nombre=None,
        firmado_por_dni=None,
    )


_PLANTILLA = SimpleNamespace(
    titulo="Contrato de locación de vehículo",
    clausulas=[
        {"numero": 1, "titulo": "Objeto",
         "texto": "El LOCADOR {{LOCADOR}} entrega en locación el vehículo, "
                  "con jurisdicción en {{JURISDICCION}}."},
        {"numero": 2, "titulo": "Uso del vehículo",
         "texto": "El LOCATARIO se obliga a usar el vehículo con la diligencia debida."},
    ],
    version=1,
    vigente_desde=date(2026, 7, 1),
)


def _runs_de_texto(pdf_bytes: bytes) -> list[tuple[float, float, float, str]]:
    """(y, x, ancho, texto) de cada trozo de texto de la página 1."""
    lector = pypdf.PdfReader(__import__("io").BytesIO(pdf_bytes))
    encontrados: list[tuple[float, float, float, str]] = []

    def visitante(texto, cm, tm, font_dict, font_size):
        if not texto or not texto.strip():
            return
        x, y = tm[4], tm[5]
        # Ancho aproximado a partir de la matriz de texto y el tamaño de
        # fuente. Alcanza para detectar solapes groseros como el que motivó
        # este test (17 pt), que es de lo que se trata.
        ancho = len(texto) * font_size * 0.5
        encontrados.append((round(y, 1), x, ancho, texto.strip()))

    lector.pages[0].extract_text(visitor_text=visitante)
    return encontrados


def _solapes(runs) -> list[str]:
    """Pares de textos que comparten baseline y cuyos rangos horizontales se
    cruzan. Un solape acá es texto ilegible en el papel."""
    por_linea: dict[float, list] = {}
    for y, x, ancho, texto in runs:
        por_linea.setdefault(y, []).append((x, ancho, texto))

    problemas = []
    for y, items in por_linea.items():
        items.sort()
        for (x1, w1, t1), (x2, w2, t2) in zip(items, items[1:]):
            if x1 + w1 > x2 + 0.5:  # medio punto de tolerancia
                problemas.append(
                    f"y={y}: {t1!r} (termina en {x1 + w1:.1f}) "
                    f"pisa a {t2!r} (empieza en {x2:.1f})"
                )
    return problemas


def test_pie_con_los_datos_fiscales_reales_no_se_pisa():
    """El caso exacto que se reportó: FINAR con su domicilio completo."""
    pdf = generar_pdf_contrato(_contrato(EMPRESA_REAL), _PLANTILLA)
    problemas = _solapes(_runs_de_texto(pdf))
    assert not problemas, "Texto encima de texto:\n" + "\n".join(problemas)


def test_pie_aguanta_un_domicilio_mucho_mas_largo():
    """El dato puede volver a crecer desde Configuración — la migración 055
    ya intenta cargar una localidad más larga que la actual. El layout tiene
    que apilar antes que superponer."""
    empresa = dict(EMPRESA_REAL)
    empresa["localidad"] = "Bahia Blanca (8000), Provincia de Buenos Aires, Republica Argentina"
    empresa["domicilio"] = "Avenida Doctor Alberto Cabrera 2415, Piso 9, Departamento A"
    pdf = generar_pdf_contrato(_contrato(empresa), _PLANTILLA)
    problemas = _solapes(_runs_de_texto(pdf))
    assert not problemas, "Texto encima de texto:\n" + "\n".join(problemas)


def test_sin_cuit_sale_la_leyenda_de_provisorio_y_no_se_pisa():
    """Sin CUIT el papel lleva la leyenda roja, que se dibuja debajo del pie.
    Si el pie se apiló, una posición fija caería encima."""
    empresa = dict(EMPRESA_REAL)
    empresa["cuit"] = ""
    empresa["ingresos_brutos"] = ""
    pdf = generar_pdf_contrato(_contrato(empresa), _PLANTILLA)
    texto = pypdf.PdfReader(__import__("io").BytesIO(pdf)).pages[0].extract_text()
    assert "DOCUMENTO PROVISORIO" in texto
    problemas = _solapes(_runs_de_texto(pdf))
    assert not problemas, "Texto encima de texto:\n" + "\n".join(problemas)


def test_los_campos_no_invaden_la_columna_de_al_lado():
    """El bloque de datos son dos columnas y el valor se dibujaba sin límite.
    Con el lugar de retiro real más largo —el Aeropuerto— y un nombre
    largo, el valor de la izquierda ya rozaba la etiqueta de la derecha."""
    contrato = _contrato(EMPRESA_REAL)
    contrato.snapshot["servicio"] = {
        "check_out_fecha": "2026-08-15", "check_out_hora": "10:00",
        "check_out_lugar": "Aeropuerto Comandante Espora",
        "check_in_fecha": "2026-08-20", "check_in_hora": "10:00",
        "check_in_lugar": "Aeropuerto Comandante Espora",
    }
    contrato.snapshot["cliente"] = {
        "id": 12345,
        "nombre": "MARIA DE LOS ANGELES RODRIGUEZ GUTIERREZ",
        "dni_cuit": "27-30111222-4",
        "domicilio": "Avenida Doctor Alberto Cabrera 2415, Piso 9, Departamento A",
        "localidad": "Bahía Blanca", "codigo_postal": "8000", "pais": "Argentina",
    }
    contrato.snapshot["vehiculo"] = {
        "patente": "AB123CD",
        "descripcion": "Volkswagen Amarok V6 Highline 3.0 TDI 4Motion",
        "categoria": "Pick-up", "interno": "17",
    }
    pdf = generar_pdf_contrato(contrato, _PLANTILLA)
    problemas = _solapes(_runs_de_texto(pdf))
    assert not problemas, "Texto encima de texto:\n" + "\n".join(problemas)


def test_ningun_texto_cae_fuera_de_la_hoja():
    """Con coordenadas absolutas, el contenido que se pasa de largo no da
    error: sigue bajando y se pierde en silencio."""
    pdf = generar_pdf_contrato(_contrato(EMPRESA_REAL), _PLANTILLA)
    fuera = [(y, t) for y, _x, _w, t in _runs_de_texto(pdf) if y < 0]
    assert not fuera, f"Texto fuera de la hoja: {fuera}"
