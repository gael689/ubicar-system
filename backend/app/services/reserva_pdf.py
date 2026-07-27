"""
PDF de confirmación de reserva — ReportLab (server-side, sin dependencias de
sistema, igual que el recibo).

Se genera al crear la reserva y cumple dos funciones a la vez:
  - queda archivado en el perfil del cliente (uso interno),
  - se descarga en el momento para mandárselo al cliente.

Por eso el tono es el de un documento que el cliente va a leer: confirma lo
acordado, no es un comprobante contable.
"""
from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas

_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo.png"

# Paleta corporativa de Ubicar (misma que --primary en el frontend).
_BRAND = HexColor("#407EC9")
_BRAND_OSCURO = HexColor("#2C5F9E")
_TINTA = HexColor("#0f172a")
_MUTED = HexColor("#475569")
_BORDE = HexColor("#cbd5e1")
_FONDO_SUAVE = HexColor("#F1F6FC")

_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
_MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

_FORMA_PAGO_LABEL = {
    "efectivo": "Efectivo",
    "transferencia": "Transferencia bancaria",
    "tarjeta": "Tarjeta",
    "cheque": "Cheque",
    "echeq": "E-cheq",
    "cuenta_corriente": "Cuenta corriente",
}

_CONDICION_PAGO_LABEL = {
    "contado": "Contado",
    "cta_cte_15": "Cuenta corriente 15 días",
    "cta_cte_30": "Cuenta corriente 30 días",
    "cta_cte_60": "Cuenta corriente 60 días",
    "cta_cte_90": "Cuenta corriente 90 días",
}

_ESTADO_PAGO_LABEL = {
    "pendiente": "Pendiente de pago",
    "anticipo": "Anticipo abonado",
    "pagado": "Abonado en su totalidad",
}

_EMPRESA_CONTACTO = (
    "Bahía Blanca, Argentina  ·  +54 9 291 4180554  ·  +54 9 11 5264791  ·  ubicar.rent@gmail.com"
)

_LEYENDA = (
    "Este documento confirma los datos de la reserva acordados con el cliente. "
    "No reemplaza al contrato de alquiler, que se firma al momento de retirar el vehículo. "
    "Ante cualquier modificación, comunicarse con nosotros por los medios indicados al pie."
)


def _fecha_larga(f: date) -> str:
    return f"{_DIAS[f.weekday()]} {f.day} de {_MESES[f.month - 1]} de {f.year}"


def _hora(h: time | None) -> str:
    return h.strftime("%H:%M") if h else "—"


def _money(v: Decimal | float | None) -> str:
    if v is None:
        return "—"
    return f"$ {Decimal(str(v)):,.2f}"


def generar_pdf_reserva(reserva, cliente, vehiculo, conductor=None) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 18 * mm

    # ── Banda superior de marca ──────────────────────────────────────────
    banda_h = 34 * mm
    c.setFillColor(_BRAND)
    c.rect(0, height - banda_h, width, banda_h, stroke=0, fill=1)

    if _LOGO_PATH.exists():
        c.drawImage(
            str(_LOGO_PATH), margin, height - banda_h + 8 * mm,
            width=38 * mm, height=18 * mm,
            preserveAspectRatio=True, mask="auto",
        )

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(width - margin, height - 16 * mm, "CONFIRMACIÓN DE RESERVA")
    c.setFont("Helvetica", 11)
    c.drawRightString(width - margin, height - 23 * mm, f"N° {reserva.id:05d}")

    y = height - banda_h - 12 * mm

    # ── Bloque: datos del cliente ────────────────────────────────────────
    y = _seccion(c, "DATOS DEL CLIENTE", margin, y, width)
    filas_cliente = [
        ("Nombre", cliente.nombre_completo),
        ("DNI / CUIT", cliente.dni_cuit or "—"),
        ("Teléfono", cliente.telefono or "—"),
        ("Email", cliente.email or "—"),
    ]
    if getattr(cliente, "tipo", None) == "empresa" and getattr(cliente, "razon_social", None):
        filas_cliente.insert(1, ("Razón social", cliente.razon_social))
    if conductor is not None:
        filas_cliente.append(("Conductor designado", conductor.nombre_completo))
    y = _tabla_dos_columnas(c, filas_cliente, margin, y, width)

    # ── Bloque: vehículo ─────────────────────────────────────────────────
    y = _seccion(c, "VEHÍCULO", margin, y, width)
    y = _tabla_dos_columnas(c, [
        ("Vehículo", f"{vehiculo.marca} {vehiculo.modelo}"),
        ("Patente", vehiculo.patente),
        ("Año", str(getattr(vehiculo, "anio", "") or "—")),
        ("Color", getattr(vehiculo, "color", None) or "—"),
    ], margin, y, width)

    # ── Bloque: período del alquiler ─────────────────────────────────────
    y = _seccion(c, "PERÍODO DEL ALQUILER", margin, y, width)
    y = _tabla_dos_columnas(c, [
        ("Retiro", f"{_fecha_larga(reserva.fecha_inicio)} · {_hora(reserva.hora_inicio)} hs"),
        ("Lugar de retiro", reserva.lugar_entrega or "—"),
        ("Devolución", f"{_fecha_larga(reserva.fecha_fin)} · {_hora(reserva.hora_fin)} hs"),
        ("Lugar de devolución", reserva.lugar_devolucion or "—"),
    ], margin, y, width, ancho_label=42 * mm)

    dias = (reserva.fecha_fin - reserva.fecha_inicio).days or 1
    c.setFont("Helvetica-Oblique", 9)
    c.setFillColor(_MUTED)
    c.drawString(margin, y, f"Duración estimada: {dias} día{'s' if dias != 1 else ''}.")
    y -= 9 * mm

    # ── Bloque: condiciones económicas (destacado) ───────────────────────
    y = _seccion(c, "CONDICIONES ECONÓMICAS", margin, y, width)

    caja_h = 18 * mm
    c.setFillColor(_FONDO_SUAVE)
    c.setStrokeColor(_BRAND)
    c.rect(margin, y - caja_h, width - 2 * margin, caja_h, stroke=1, fill=1)
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(margin + 6 * mm, y - 7 * mm, "TOTAL DE LA RESERVA")
    c.setFillColor(_BRAND_OSCURO)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin + 6 * mm, y - 15 * mm, _money(reserva.precio_total))

    estado = _ESTADO_PAGO_LABEL.get(reserva.estado_pago, reserva.estado_pago or "—")
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawRightString(width - margin - 6 * mm, y - 7 * mm, "ESTADO")
    c.setFillColor(_TINTA)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(width - margin - 6 * mm, y - 14 * mm, estado)
    y -= caja_h + 6 * mm

    filas_pago = [
        ("Forma de pago", _FORMA_PAGO_LABEL.get(reserva.forma_pago_prevista, reserva.forma_pago_prevista or "A convenir")),
        ("Condición de pago", _CONDICION_PAGO_LABEL.get(reserva.condicion_pago, reserva.condicion_pago or "Contado")),
    ]
    if reserva.anticipo_monto:
        filas_pago.append(("Anticipo abonado", _money(reserva.anticipo_monto)))
        saldo = Decimal(str(reserva.precio_total or 0)) - Decimal(str(reserva.anticipo_monto))
        filas_pago.append(("Saldo pendiente", _money(saldo)))
    if reserva.garantia_tipo and reserva.garantia_tipo != "no_aplica":
        filas_pago.append(("Garantía", f"{reserva.garantia_tipo.capitalize()} · {_money(reserva.garantia_monto)}"))
    y = _tabla_dos_columnas(c, filas_pago, margin, y, width, ancho_label=42 * mm)

    # ── Observaciones ────────────────────────────────────────────────────
    if reserva.notas:
        y = _seccion(c, "OBSERVACIONES", margin, y, width)
        c.setFont("Helvetica", 10)
        c.setFillColor(_TINTA)
        texto = c.beginText(margin, y)
        texto.setLeading(13)
        for linea in _wrap(reserva.notas, 95):
            texto.textLine(linea)
            y -= 13
        c.drawText(texto)
        y -= 6 * mm

    # ── Leyenda + pie ────────────────────────────────────────────────────
    # La leyenda va anclada arriba del pie, no flotando donde haya terminado
    # el contenido. Sólo se pasa a una segunda hoja si el contenido realmente
    # llegó hasta ahí — con los datos habituales, la reserva entra en una.
    lineas_leyenda = _wrap(_LEYENDA, 118)
    alto_leyenda = len(lineas_leyenda) * 11 + 4
    tope_leyenda = 24 * mm + alto_leyenda

    if y < tope_leyenda:
        _pie(c, width, margin)
        c.showPage()

    c.setFont("Helvetica-Oblique", 8.5)
    c.setFillColor(_MUTED)
    texto = c.beginText(margin, 24 * mm + alto_leyenda - 11)
    texto.setLeading(11)
    for linea in lineas_leyenda:
        texto.textLine(linea)
    c.drawText(texto)

    _pie(c, width, margin)
    c.showPage()
    c.save()
    return buffer.getvalue()


def _pie(c: canvas.Canvas, width: float, margin: float) -> None:
    """Línea de marca + datos de contacto. Se dibuja en todas las páginas."""
    c.setStrokeColor(_BRAND)
    c.setLineWidth(2)
    c.line(margin, 16 * mm, width - margin, 16 * mm)
    c.setFont("Helvetica", 8)
    c.setFillColor(_MUTED)
    c.drawCentredString(width / 2, 10 * mm, _EMPRESA_CONTACTO)


# ── Helpers de layout ────────────────────────────────────────────────────────

def _seccion(c: canvas.Canvas, titulo: str, margin: float, y: float, width: float) -> float:
    """Título de sección con la línea de marca debajo. Devuelve la nueva `y`."""
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(_BRAND_OSCURO)
    c.drawString(margin, y, titulo)
    y -= 2.5 * mm
    c.setStrokeColor(_BRAND)
    c.setLineWidth(1)
    c.line(margin, y, width - margin, y)
    return y - 6 * mm


def _tabla_dos_columnas(
    c: canvas.Canvas,
    filas: list[tuple[str, str]],
    margin: float,
    y: float,
    width: float,
    ancho_label: float = 36 * mm,
) -> float:
    """Filas etiqueta/valor a dos columnas por renglón cuando entran."""
    for etiqueta, valor in filas:
        c.setFont("Helvetica", 9)
        c.setFillColor(_MUTED)
        c.drawString(margin, y, etiqueta)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(_TINTA)
        c.drawString(margin + ancho_label, y, str(valor))
        y -= 6 * mm
    return y - 3 * mm


def _wrap(text: str, width: int) -> list[str]:
    lineas: list[str] = []
    for parrafo in str(text).splitlines() or [""]:
        actual = ""
        for palabra in parrafo.split():
            candidato = f"{actual} {palabra}".strip()
            if len(candidato) > width:
                lineas.append(actual)
                actual = palabra
            else:
                actual = candidato
        lineas.append(actual)
    return [l for l in lineas if l != "" or len(lineas) == 1]
