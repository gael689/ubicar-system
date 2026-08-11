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

# **El logo va en blanco, no el de siempre.** El de siempre es tinta azul
# oscura sobre transparente, y acá se dibuja encima de la banda de marca, que
# también es oscura: el resultado era un logo que no se veía. Es la misma
# imagen con los píxeles visibles pasados a blanco, conservando el canal alfa
# para que los bordes sigan suaves.
#
# Los otros dos PDF —recibo y contrato— dibujan sobre fondo blanco, así que
# **ahí el logo oscuro es el correcto** y no hay que tocarlos.
_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo_blanco.png"
_LOGO_FALLBACK = Path(__file__).resolve().parents[1] / "assets" / "logo.png"

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

# Corto a propósito: la letra chica larga no se lee. Dice las dos cosas que
# importan —que no es el contrato y a dónde escribir— y nada más.
_LEYENDA = (
    "Este documento confirma lo acordado, pero no reemplaza al contrato de alquiler, "
    "que se firma al retirar el vehículo. Para cualquier cambio, escribinos a los datos del pie."
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

    logo = _LOGO_PATH if _LOGO_PATH.exists() else _LOGO_FALLBACK
    if logo.exists():
        c.drawImage(
            str(logo), margin, height - banda_h + 8 * mm,
            width=38 * mm, height=18 * mm,
            preserveAspectRatio=True, mask="auto",
        )

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(width - margin, height - 16 * mm, "CONFIRMACIÓN DE RESERVA")
    c.setFont("Helvetica", 11)
    c.drawRightString(width - margin, height - 23 * mm, f"N° {reserva.id:05d}")

    y = height - banda_h - 10 * mm

    # ── Agradecimiento ───────────────────────────────────────────────────
    #
    # Va arriba de todo y no al pie: es lo primero que se lee al abrir el
    # archivo, y es la única línea del documento que le habla a la persona en
    # vez de informarle un dato.
    #
    # Cambia según de dónde vino la reserva. Quien reservó por la web no habló
    # con nadie: para esa persona este PDF **es** el primer contacto con la
    # empresa, así que dice explícitamente que hay alguien del otro lado.
    # Con una empresa se saluda a la empresa, no al primer nombre de quien
    # firma: tutear a una razón social suena mal en un documento comercial.
    if cliente and getattr(cliente, "tipo", None) == "empresa":
        saludo = "¡Gracias por elegirnos!"
    else:
        partes = (getattr(cliente, "nombre_completo", "") or "").split()
        saludo = f"¡Gracias, {partes[0]}!" if partes else "¡Gracias por elegirnos!"
    desde_web = getattr(reserva, "origen", "sistema") == "web"

    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(_BRAND_OSCURO)
    c.drawString(margin, y, saludo)
    y -= 5.5 * mm

    agradecimiento = (
        "Tu reserva quedó registrada y en breve nos comunicamos para coordinar la "
        "entrega. Guardá este comprobante: tiene todo lo que acordamos."
        if desde_web else
        "Tu reserva quedó confirmada. Abajo está el detalle de lo que acordamos, "
        "para que lo tengas a mano."
    )
    c.setFont("Helvetica", 9.5)
    c.setFillColor(_MUTED)
    texto = c.beginText(margin, y)
    texto.setLeading(12)
    for linea in _wrap(agradecimiento, 105):
        texto.textLine(linea)
        y -= 12
    c.drawText(texto)
    y -= 4 * mm

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
    # Una reserva por categoría (ítem 58) todavía no tiene auto asignado: se
    # informa la categoría contratada. **No se promete un modelo puntual** —
    # el auto se asigna al entregar, y prometer una patente que después
    # cambia es exactamente el conflicto que hay que evitar en el mostrador.
    if vehiculo is not None:
        y = _seccion(c, "VEHÍCULO", margin, y, width)
        y = _tabla_dos_columnas(c, [
            ("Vehículo", f"{vehiculo.marca} {vehiculo.modelo}"),
            ("Patente", vehiculo.patente),
            ("Año", str(getattr(vehiculo, "anio", "") or "—")),
            ("Color", getattr(vehiculo, "color", None) or "—"),
        ], margin, y, width)
    else:
        categoria = getattr(reserva, "categoria", None)
        y = _seccion(c, "CATEGORÍA CONTRATADA", margin, y, width)
        filas = [("Categoría", categoria.nombre if categoria else "—")]
        if categoria is not None and getattr(categoria, "ejemplo_modelos", None):
            filas.append(("Modelos", categoria.ejemplo_modelos))
        filas.append(("Vehículo asignado", "Se asigna al momento de la entrega"))
        y = _tabla_dos_columnas(c, filas, margin, y, width)

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
    y -= 7 * mm

    # ── Bloque: adicionales contratados ──────────────────────────────────
    #
    # Faltaban del documento, y eso hacía que el cliente recibiera un papel que
    # no mencionaba las coberturas que había contratado — justo lo que va a
    # querer releer si pasa algo.
    adicionales = list(getattr(reserva, "adicionales", []) or [])
    if adicionales:
        y = _seccion(c, "ADICIONALES CONTRATADOS", margin, y, width)
        for ra in adicionales:
            nombre = ra.adicional.nombre if ra.adicional else "Adicional"
            if ra.cantidad > 1:
                nombre = f"{nombre}  ×{ra.cantidad}"
            c.setFont("Helvetica", 9.5)
            c.setFillColor(_TINTA)
            c.drawString(margin, y, nombre)
            c.setFont("Helvetica", 8.5)
            c.setFillColor(_MUTED)
            c.drawString(
                margin + 90 * mm, y,
                "por día" if ra.unidad_cobro == "por_dia" else "único",
            )
            c.setFont("Helvetica-Bold", 9.5)
            c.setFillColor(_TINTA)
            c.drawRightString(width - margin, y, _money(ra.subtotal))
            y -= 6 * mm
        y -= 3 * mm

    # ── Bloque: condiciones económicas (destacado) ───────────────────────
    y = _seccion(c, "CONDICIONES ECONÓMICAS", margin, y, width)

    # `precio_total` es sólo el alquiler del vehículo: los adicionales y el
    # late checkout viven aparte a propósito (ver `Reserva.total_adicionales`).
    # El documento que recibe el cliente tiene que decir **lo que va a pagar**,
    # así que acá se suman. Mostrar `precio_total` pelado le informaba de menos
    # a quien había contratado una cobertura.
    subtotal_alquiler = Decimal(str(reserva.precio_total or 0))
    total_adic = Decimal(str(reserva.total_adicionales or 0))
    cargo_late = Decimal(str(reserva.cargo_late_checkout or 0))
    total_general = subtotal_alquiler + total_adic + cargo_late

    caja_h = 18 * mm
    c.setFillColor(_FONDO_SUAVE)
    c.setStrokeColor(_BRAND)
    c.rect(margin, y - caja_h, width - 2 * margin, caja_h, stroke=1, fill=1)
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(margin + 6 * mm, y - 7 * mm, "TOTAL DE LA RESERVA")
    c.setFillColor(_BRAND_OSCURO)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin + 6 * mm, y - 15 * mm, _money(total_general))

    estado = _ESTADO_PAGO_LABEL.get(reserva.estado_pago, reserva.estado_pago or "—")
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 9)
    c.drawRightString(width - margin - 6 * mm, y - 7 * mm, "ESTADO")
    c.setFillColor(_TINTA)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(width - margin - 6 * mm, y - 14 * mm, estado)
    y -= caja_h + 6 * mm

    filas_pago = []
    # El desglose sólo aparece si hay algo que desglosar: con una reserva
    # simple, repetir el mismo número dos veces es ruido.
    if total_adic or cargo_late:
        filas_pago.append(("Alquiler del vehículo", _money(subtotal_alquiler)))
        if total_adic:
            filas_pago.append(("Adicionales", _money(total_adic)))
        if cargo_late:
            filas_pago.append(("Devolución fuera de horario", _money(cargo_late)))
    filas_pago += [
        ("Forma de pago", _FORMA_PAGO_LABEL.get(reserva.forma_pago_prevista, reserva.forma_pago_prevista or "A convenir")),
        ("Condición de pago", _CONDICION_PAGO_LABEL.get(reserva.condicion_pago, reserva.condicion_pago or "Contado")),
    ]
    if reserva.anticipo_monto:
        filas_pago.append(("Anticipo abonado", _money(reserva.anticipo_monto)))
        saldo = total_general - Decimal(str(reserva.anticipo_monto))
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

    # ── Bloque de pie: qué llevar + leyenda ──────────────────────────────
    #
    # Los dos van juntos y anclados arriba del pie, no flotando donde haya
    # terminado el contenido. Es información práctica y letra chica: agrupada
    # al final se lee como tal, y mezclada entre las secciones de datos
    # competía con ellas por atención.
    #
    # Lo de "qué llevar" es la pregunta que el cliente hace por teléfono el día
    # antes. En el papel ahorra esa llamada y evita el caso caro: que llegue
    # sin licencia y la entrega se caiga con el auto ya reservado.
    items_retiro = [
        "Licencia de conducir vigente (la original, no una foto).",
        "DNI del titular y de cada conductor autorizado.",
        "La tarjeta de crédito a nombre del titular, para la garantía.",
    ]
    lineas_leyenda = _wrap(_LEYENDA, 118)

    alto_retiro = 5 * mm + len(items_retiro) * 4.6 * mm
    alto_leyenda = len(lineas_leyenda) * 11 + 4
    alto_bloque = alto_retiro + alto_leyenda + 3 * mm
    tope = 24 * mm + alto_bloque

    if y < tope:
        _pie(c, width, margin)
        c.showPage()

    yy = tope - 4 * mm

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(_BRAND_OSCURO)
    c.drawString(margin, yy, "PARA EL DÍA DEL RETIRO")
    yy -= 5 * mm

    for item in items_retiro:
        c.setFillColor(_BRAND)
        c.circle(margin + 1.5 * mm, yy + 1.1 * mm, 0.8 * mm, stroke=0, fill=1)
        c.setFont("Helvetica", 8.5)
        c.setFillColor(_TINTA)
        c.drawString(margin + 5 * mm, yy, item)
        yy -= 4.6 * mm

    yy -= 2 * mm
    c.setFont("Helvetica-Oblique", 8.5)
    c.setFillColor(_MUTED)
    texto = c.beginText(margin, yy)
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
    return y - 5 * mm


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
        y -= 5.5 * mm
    return y - 2 * mm


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
