"""
Generación del PDF de un recibo con ReportLab (server-side, sin dependencias
de sistema — a diferencia de WeasyPrint, que requiere GTK+ no disponible en
Windows). El texto de agradecimiento es fijo (D-15), no editable.
"""
from __future__ import annotations
from io import BytesIO
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from app.domain.monto_letras import monto_a_letras
from app.models.recibo import Recibo

_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo.png"

_PRIMARY = HexColor("#0f172a")
_MUTED = HexColor("#475569")
_BORDER = HexColor("#cbd5e1")

_AGRADECIMIENTO = (
    "Gracias por elegir Ubicar Rent. Su confianza es lo que nos impulsa a seguir "
    "mejorando el servicio día a día. Quedamos a su disposición para su próximo alquiler."
)

_MEDIO_PAGO_LABEL = {
    "efectivo": "Efectivo",
    "transferencia": "Transferencia bancaria",
    "tarjeta": "Tarjeta",
    "cheque": "Cheque",
    "echeq": "E-cheq",
}

_EMPRESA_CONTACTO = (
    "Bahía Blanca, Argentina  ·  +54 9 291 4180554  ·  +54 9 11 5264791  ·  ubicar.rent@gmail.com"
)


def generar_pdf_recibo(recibo: Recibo, cliente_nombre: str, cliente_dni: str) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 20 * mm
    y = height - margin

    # ── Encabezado ──────────────────────────────────────────────────────
    if _LOGO_PATH.exists():
        c.drawImage(
            str(_LOGO_PATH), margin, y - 18 * mm, width=40 * mm, height=19 * mm,
            preserveAspectRatio=True, mask="auto",
        )

    numero_display = f"{recibo.numero:05d}"
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(_PRIMARY)
    c.drawRightString(width - margin, y - 6 * mm, f"RECIBO N° {numero_display}")
    c.setFont("Helvetica", 10)
    c.setFillColor(_MUTED)
    c.drawRightString(width - margin, y - 12 * mm, f"Fecha: {recibo.fecha.strftime('%d/%m/%Y')}")
    if recibo.estado == "anulado":
        c.setFillColor(HexColor("#b91c1c"))
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(width - margin, y - 18 * mm, "ANULADO")

    y -= 26 * mm
    c.setStrokeColor(_BORDER)
    c.line(margin, y, width - margin, y)
    y -= 10 * mm

    # ── Datos del cliente ───────────────────────────────────────────────
    c.setFont("Helvetica", 11)
    c.setFillColor(_PRIMARY)
    c.drawString(margin, y, f"Recibí de: {cliente_nombre}  (DNI/CUIT {cliente_dni})")
    y -= 8 * mm

    c.setFont("Helvetica", 11)
    c.drawString(margin, y, "La suma de:")
    y -= 6 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, monto_a_letras(recibo.monto))
    y -= 10 * mm

    c.setFont("Helvetica", 11)
    c.drawString(margin, y, f"En concepto de: {recibo.concepto}")
    y -= 7 * mm
    c.drawString(margin, y, f"Medio de pago: {_MEDIO_PAGO_LABEL.get(recibo.medio_pago, recibo.medio_pago)}")
    y -= 12 * mm

    # ── Tabla de saldos ─────────────────────────────────────────────────
    col_w = (width - 2 * margin) / 3
    labels = ["Saldo anterior", "Este pago", "Saldo actual"]
    valores = [
        _formato_saldo(recibo.saldo_anterior),
        f"$ {recibo.monto:,.2f}",
        _formato_saldo(recibo.saldo_posterior),
    ]
    c.setStrokeColor(_BORDER)
    c.rect(margin, y - 18 * mm, width - 2 * margin, 18 * mm)
    for i in range(1, 3):
        c.line(margin + i * col_w, y - 18 * mm, margin + i * col_w, y)
    c.setFont("Helvetica", 9)
    c.setFillColor(_MUTED)
    for i, label in enumerate(labels):
        c.drawCentredString(margin + col_w * i + col_w / 2, y - 6 * mm, label)
    c.setFillColor(_PRIMARY)
    for i, valor in enumerate(valores):
        c.setFont("Helvetica-Bold", 10 if len(valor) > 14 else 12)
        c.drawCentredString(margin + col_w * i + col_w / 2, y - 14 * mm, valor)
    y -= 30 * mm

    if recibo.estado == "anulado" and recibo.motivo_anulacion:
        c.setFont("Helvetica-Oblique", 9)
        c.setFillColor(HexColor("#b91c1c"))
        c.drawString(margin, y, f"Motivo de anulación: {recibo.motivo_anulacion}")
        y -= 10 * mm

    # ── Agradecimiento (fijo) ───────────────────────────────────────────
    c.setFont("Helvetica-Oblique", 10)
    c.setFillColor(_MUTED)
    text = c.beginText(margin, y)
    text.setLeading(14)
    for line in _wrap(_AGRADECIMIENTO, 90):
        text.textLine(line)
    c.drawText(text)

    # ── Pie ──────────────────────────────────────────────────────────────
    c.setFont("Helvetica", 8)
    c.setFillColor(_MUTED)
    c.drawCentredString(width / 2, margin - 5 * mm, _EMPRESA_CONTACTO)

    c.showPage()
    c.save()
    return buffer.getvalue()


def _formato_saldo(saldo) -> str:
    """D-01: saldo positivo = el cliente debe; negativo = a favor. En el
    recibo (documento para el cliente) se muestra siempre en valor absoluto
    con la aclaración, igual que en CuentaCorrienteTab.tsx del frontend."""
    monto = abs(saldo)
    if saldo < 0:
        return f"$ {monto:,.2f} (a favor)"
    return f"$ {monto:,.2f}"


def _wrap(text: str, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines
