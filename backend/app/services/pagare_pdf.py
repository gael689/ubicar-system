"""
PDF del pagaré — ReportLab, una página A4.

Mismo pipeline que `contrato_pdf.py`: sin dependencias de sistema, y todo sale
del `snapshot` congelado del pagaré, nunca de las tablas vivas.

La maqueta es la que pidió Ubicar:

    PAGARÉ                                              N° P-00000012
    Bahía Blanca, 12 de septiembre de 2026             Por $ 140.000,00
    A la vista pagaré solidariamente y sin protesto (…)

    ____________________                    ____________________
    Firma del deudor                        Firma del co-deudor
    Nombre · DNI · Domicilio                Nombre · DNI · Domicilio

Va en un recuadro en la mitad superior de la hoja: es la forma en que se
reconoce un pagaré impreso, y deja lugar abajo para que el ejemplar en papel se
pueda recortar sin perder nada.
"""
from __future__ import annotations

from datetime import timezone
from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.services.pagare_service import ZONA, dia_local
from app.domain.pagare_texto import encabezado_fecha

_TINTA = HexColor("#111111")
_GRIS = HexColor("#555555")
_LINEA = HexColor("#999999")
_MARGEN = 16 * mm


def _wrap(texto: str, fuente: str, tam: float, ancho: float) -> list[str]:
    lineas, actual = [], ""
    for palabra in texto.split():
        prueba = f"{actual} {palabra}".strip()
        if stringWidth(prueba, fuente, tam) <= ancho:
            actual = prueba
        else:
            if actual:
                lineas.append(actual)
            actual = palabra
    if actual:
        lineas.append(actual)
    return lineas


def _linea_justificada(c: canvas.Canvas, x: float, y: float, ancho: float, linea: str, fuente: str, tam: float):
    palabras = linea.split()
    if len(palabras) < 2:
        c.drawString(x, y, linea)
        return
    ocupado = sum(stringWidth(p, fuente, tam) for p in palabras)
    hueco = (ancho - ocupado) / (len(palabras) - 1)
    cursor = x
    for p in palabras:
        c.drawString(cursor, y, p)
        cursor += stringWidth(p, fuente, tam) + hueco


def _firma(
    c: canvas.Canvas, x: float, y: float, ancho: float, titulo: str,
    datos: dict, imagen: bytes | None,
) -> None:
    """Línea de firma con la imagen apoyada encima y los datos abajo."""
    if imagen:
        try:
            c.drawImage(
                ImageReader(BytesIO(imagen)), x, y + 1.5 * mm,
                width=min(ancho, 55 * mm), height=14 * mm,
                preserveAspectRatio=True, anchor="sw", mask="auto",
            )
        except Exception:
            pass  # una firma ilegible no puede impedir reimprimir
    c.setStrokeColor(_LINEA)
    c.setLineWidth(0.6)
    c.line(x, y, x + ancho, y)
    c.setFillColor(_TINTA)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x, y - 3.8 * mm, titulo)
    c.setFont("Helvetica", 7.5)
    renglon = y - 7.3 * mm
    for etiqueta, valor in (("Aclaración", datos.get("nombre")), ("DNI", datos.get("dni")), ("Domicilio", datos.get("domicilio"))):
        texto = f"{etiqueta}: {valor or ''}"
        for i, parte in enumerate(_wrap(texto, "Helvetica", 7.5, ancho) or [texto]):
            c.drawString(x, renglon, parte)
            renglon -= 3.4 * mm


def generar_pdf_pagare(pagare, firma: bytes | None = None, firmas_codeudores: list | None = None) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    ancho_hoja, alto_hoja = A4
    snap = pagare.snapshot or {}
    codeudores = snap.get("codeudores") or []
    firmas_codeudores = firmas_codeudores or []

    izq = _MARGEN
    der = ancho_hoja - _MARGEN
    util = der - izq
    arriba = alto_hoja - _MARGEN

    y = arriba - 9 * mm
    c.setFillColor(_TINTA)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(izq + 6 * mm, y, snap.get("titulo") or "PAGARÉ")
    c.setFont("Helvetica", 8)
    c.setFillColor(_GRIS)
    c.drawRightString(der - 6 * mm, y + 1 * mm, f"N° {pagare.numero_formateado}")

    # ── Encabezado: lugar y fecha | Por $ ─────────────────────────────────
    # La fecha es la de la firma; sin firma, la de emisión. Un pagaré no
    # puede decir que se creó antes del día en que alguien lo firmó.
    dia = dia_local(pagare.firmado_at or pagare.fecha_generacion)
    y -= 10 * mm
    c.setFillColor(_TINTA)
    c.setFont("Helvetica", 10)
    c.drawString(izq + 6 * mm, y, encabezado_fecha(snap.get("lugar_emision") or "Bahía Blanca", dia))

    por = f"Por $ {snap.get('monto_numerico') or ''}"
    c.setFont("Helvetica-Bold", 11)
    ancho_por = stringWidth(por, "Helvetica-Bold", 11) + 8 * mm
    c.setStrokeColor(_TINTA)
    c.setLineWidth(0.8)
    c.rect(der - 6 * mm - ancho_por, y - 2.8 * mm, ancho_por, 8 * mm, stroke=1, fill=0)
    c.drawRightString(der - 10 * mm, y, por)

    # ── Cuerpo ────────────────────────────────────────────────────────────
    y -= 11 * mm
    c.setFont("Helvetica", 9.5)
    ancho_texto = util - 12 * mm
    lineas = _wrap(snap.get("texto") or "", "Helvetica", 9.5, ancho_texto)
    for i, linea in enumerate(lineas):
        if i < len(lineas) - 1:
            _linea_justificada(c, izq + 6 * mm, y, ancho_texto, linea, "Helvetica", 9.5)
        else:
            c.drawString(izq + 6 * mm, y, linea)
        y -= 5 * mm

    # ── Firmas: deudor a la izquierda, co-deudores a la derecha ───────────
    y -= 20 * mm
    columna = (util - 12 * mm - 14 * mm) / 2
    x_izq = izq + 6 * mm
    x_der = x_izq + columna + 14 * mm

    _firma(c, x_izq, y, columna, "Firma del deudor", snap.get("deudor") or {}, firma)

    y_der = y
    for i, cod in enumerate(codeudores):
        titulo = "Firma del co-deudor" if len(codeudores) == 1 else f"Firma del co-deudor {i + 1}"
        imagen = firmas_codeudores[i] if i < len(firmas_codeudores) else None
        _firma(c, x_der, y_der, columna, titulo, cod, imagen)
        y_der -= 34 * mm

    fondo = min(y - 27 * mm, y_der + 7 * mm)

    # ── Constancia de cómo se firmó ───────────────────────────────────────
    c.setFont("Helvetica", 6.5)
    c.setFillColor(_GRIS)
    if pagare.firmado and pagare.firmado_at:
        # En hora de Argentina: quien lee el papel no piensa en UTC.
        cuando = (
            pagare.firmado_at.replace(tzinfo=timezone.utc).astimezone(ZONA).strftime("%d/%m/%Y %H:%M")
        )
        if pagare.firma_medio == "papel":
            nota = f"Firmado de puño y letra el {dia:%d/%m/%Y}. El ejemplar firmado se archiva en papel."
        elif pagare.firma_medio == "link":
            nota = f"Firmado desde el link el {cuando} (hora de Argentina)" + (f" · IP {pagare.firma_ip}" if pagare.firma_ip else "")
        else:
            nota = f"Firmado en el mostrador el {cuando} (hora de Argentina)."
        c.drawString(izq + 6 * mm, fondo + 3 * mm, nota)

    c.setStrokeColor(_TINTA)
    c.setLineWidth(1)
    c.rect(izq, fondo, util, arriba - fondo, stroke=1, fill=0)

    c.showPage()
    c.save()
    return buffer.getvalue()
