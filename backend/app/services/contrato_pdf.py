"""
PDF del contrato de alquiler — ReportLab, dos páginas A4.

Mismo pipeline que `recibo_pdf.py` y `reserva_pdf.py`: sin dependencias de
sistema y sin navegador, porque un contrato tiene que poder regenerarse desde
un job y salir idéntico siempre.

**Página 1 = anverso.** Densa, en bloques, tipografía chica. No se maqueta
como el recibo ni como la confirmación de reserva: esos son documentos
comerciales con aire y color. Este es un formulario administrativo y tiene que
parecerlo — si se lo hace "lindo" pierde el registro visual de contrato.

**Página 2 = reverso.** El clausulado a dos columnas, justificado, cuerpo
chico, con los subrayados donde el original los tiene. Se renderiza desde la
plantilla versionada, con `{{LOCADOR}}` y `{{JURISDICCION}}` resueltos.

Todo sale del `snapshot` congelado del contrato, nunca de las tablas vivas.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo.png"

_TINTA = HexColor("#111111")
_GRIS = HexColor("#555555")
_LINEA = HexColor("#999999")
_FONDO = HexColor("#EEEEEE")

_MARGEN = 14 * mm


def _money(v) -> str:
    try:
        return f"{float(v):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")
    except (TypeError, ValueError):
        return "0,00"


def _fecha(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def _wrap(texto: str, fuente: str, tam: float, ancho: float) -> list[str]:
    """Corta el texto en líneas que entran en `ancho`."""
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


# ─── Anverso ─────────────────────────────────────────────────────────────────

def _campo(c: canvas.Canvas, x: float, y: float, etiqueta: str, valor, tam: float = 7.5) -> float:
    c.setFont("Helvetica", tam - 1)
    c.setFillColor(_GRIS)
    c.drawString(x, y, etiqueta)
    c.setFont("Helvetica-Bold", tam)
    c.setFillColor(_TINTA)
    c.drawString(x + 32 * mm, y, str(valor if valor not in (None, "") else "—"))
    return y - 4.2 * mm


def _titulo_bloque(c: canvas.Canvas, x: float, y: float, ancho: float, texto: str) -> float:
    c.setFillColor(_FONDO)
    c.rect(x, y - 1 * mm, ancho, 4.5 * mm, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(_TINTA)
    c.drawString(x + 1.5 * mm, y + 0.4 * mm, texto.upper())
    return y - 6 * mm


def _anverso(c: canvas.Canvas, contrato, snap: dict) -> float:
    """Dibuja el anverso y **devuelve la altura de la línea de firma**.

    La devuelve porque esa línea flota: sube o baja según cuántos cargos y
    cuántas líneas de aceptación haya. Quien dibuja la firma escaneada
    necesita ese número — con una posición fija, el trazo caía al pie de la
    página, lejos de la línea, y el papel parecía sin firmar.
    """
    ancho, alto = A4
    util = ancho - 2 * _MARGEN
    col = util / 2 - 3 * mm

    # ── Cabecera ──────────────────────────────────────────────────────────
    if _LOGO_PATH.exists():
        c.drawImage(str(_LOGO_PATH), ancho - _MARGEN - 38 * mm, alto - _MARGEN - 14 * mm,
                    width=38 * mm, height=14 * mm, preserveAspectRatio=True, mask="auto")

    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(_TINTA)
    c.drawString(_MARGEN, alto - _MARGEN - 10 * mm, "Contrato de Alquiler")

    c.setFont("Helvetica", 8)
    c.drawRightString(ancho - _MARGEN, alto - _MARGEN - 18 * mm,
                      f"Número de Contrato: {contrato.numero_formateado}")

    y = alto - _MARGEN - 26 * mm
    izq, der = _MARGEN, _MARGEN + col + 6 * mm

    # ── Servicio (izq) y datos administrativos (der) ──────────────────────
    servicio = snap.get("servicio", {})
    vehiculo = snap.get("vehiculo", {})

    y_izq = _titulo_bloque(c, izq, y, col, "Datos del alquiler")
    y_izq = _campo(c, izq, y_izq, "Check Out",
                   f"{_fecha(servicio.get('check_out_fecha'))} {servicio.get('check_out_hora') or ''} "
                   f"{servicio.get('check_out_lugar') or ''}".strip())
    y_izq = _campo(c, izq, y_izq, "Check In",
                   f"{_fecha(servicio.get('check_in_fecha'))} {servicio.get('check_in_hora') or ''} "
                   f"{servicio.get('check_in_lugar') or ''}".strip())
    # Un contrato emitido antes de la entrega todavía no tiene km ni
    # combustible de salida. Se imprime una línea para completar a mano, no
    # "None km": el papel se firma en el mostrador y ese dato se anota ahí.
    _km = servicio.get("check_out_km")
    _comb = servicio.get("check_out_combustible")
    y_izq = _campo(c, izq, y_izq, "Kilometraje", f"{_km} km" if _km is not None else "______________")
    y_izq = _campo(
        c, izq, y_izq, "Combustible salida",
        f"{_comb} %" if _comb is not None else "______________",
    )
    y_izq = _campo(c, izq, y_izq, "Vehículo", vehiculo.get("descripcion") or "—")

    y_der = _titulo_bloque(c, der, y, col, "Datos administrativos")
    y_der = _campo(c, der, y_der, "Número de cliente", (snap.get("cliente") or {}).get("id"))
    y_der = _campo(c, der, y_der, "Patente", vehiculo.get("patente"))
    y_der = _campo(c, der, y_der, "Número Interno", vehiculo.get("interno"))
    y_der = _campo(c, der, y_der, "Número de Reserva", snap.get("reserva_id"))
    y_der = _campo(c, der, y_der, "Categoría", vehiculo.get("categoria"))

    y = min(y_izq, y_der) - 2 * mm

    # ── Conductor ─────────────────────────────────────────────────────────
    cli = snap.get("cliente", {})
    cond = snap.get("conductor_adicional", {})

    y_izq = _titulo_bloque(c, izq, y, col, "Conductor")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(_TINTA)
    c.drawString(izq, y_izq, (cli.get("nombre") or "—").upper())
    y_izq -= 4 * mm
    c.setFont("Helvetica", 7.5)
    for linea in [
        cli.get("domicilio") or "",
        " ".join(x for x in [cli.get("codigo_postal"), cli.get("localidad")] if x),
        cli.get("pais") or "",
    ]:
        if linea:
            c.drawString(izq, y_izq, linea)
            y_izq -= 3.6 * mm
    y_izq -= 1 * mm
    y_izq = _campo(c, izq, y_izq, "DNI / CUIT", cli.get("dni_cuit"))
    y_izq = _campo(c, izq, y_izq, "Empresa", cli.get("empresa"))
    y_izq = _campo(c, izq, y_izq, "Segundo Conductor", cond.get("nombre"))

    y_der = _titulo_bloque(c, der, y, col, "Registro y condiciones")
    registro = ", ".join(x for x in [
        cli.get("licencia_numero"), _fecha(cli.get("licencia_vencimiento")),
        cli.get("licencia_pais"), cli.get("licencia_categoria"),
    ] if x and x != "—")
    y_der = _campo(c, der, y_der, "Registro de Conductor", registro)
    if cond.get("nombre"):
        y_der = _campo(c, der, y_der, "Doc. 2° conductor", cond.get("dni"))
        y_der = _campo(c, der, y_der, "Dom. 2° conductor", cond.get("domicilio"))

    y = min(y_izq, y_der) - 2 * mm

    # ── Desglose de cargos ────────────────────────────────────────────────
    cargos = snap.get("cargos", {})
    y = _titulo_bloque(c, izq, y, util, "Detalle de cargos")

    c.setFont("Helvetica", 6.5)
    c.setFillColor(_GRIS)
    c.drawString(izq, y, "Concepto")
    c.drawRightString(izq + util * 0.58, y, "Cantidad")
    c.drawRightString(izq + util * 0.78, y, "Valor unitario")
    c.drawRightString(izq + util, y, "Valor Total")
    y -= 1.5 * mm
    c.setStrokeColor(_LINEA)
    c.line(izq, y, izq + util, y)
    y -= 4 * mm

    c.setFont("Helvetica", 7.5)
    c.setFillColor(_TINTA)
    for linea in cargos.get("lineas", []):
        c.drawString(izq, y, str(linea.get("concepto", "")))
        c.drawRightString(izq + util * 0.58, y, str(linea.get("cantidad", "")))
        c.drawRightString(izq + util * 0.78, y, _money(linea.get("valor_unitario")))
        c.drawRightString(izq + util, y, f"{_money(linea.get('total'))} ARS")
        y -= 4 * mm

    if cargos.get("descuento"):
        c.setFillColor(_GRIS)
        c.drawString(izq, y, "Descuento aplicado")
        c.drawRightString(izq + util, y, f"-{_money(cargos['descuento'])} ARS")
        c.setFillColor(_TINTA)
        y -= 4 * mm

    y -= 1 * mm
    c.line(izq + util * 0.5, y, izq + util, y)
    y -= 4.5 * mm

    estimado = float(cargos.get("valor_estimado") or 0)
    if cargos.get("discrimina_iva"):
        neto = estimado / 1.21
        c.setFont("Helvetica", 7.5)
        c.drawRightString(izq + util * 0.78, y, "Valor Neto")
        c.drawRightString(izq + util, y, f"{_money(neto)} ARS")
        y -= 4 * mm
        c.drawRightString(izq + util * 0.78, y, "21,00% IVA")
        c.drawRightString(izq + util, y, f"{_money(estimado - neto)} ARS")
        y -= 4.5 * mm

    # "Valor estimado" y no "Total": al firmar, el auto todavía no volvió.
    # El excedente, el combustible y los daños se liquidan en el check-in.
    c.setFont("Helvetica-Bold", 9.5)
    c.drawRightString(izq + util * 0.78, y, "Valor Estimado")
    c.drawRightString(izq + util, y, f"{_money(estimado)} ARS")
    y -= 6 * mm

    # ── Coberturas, rechazos y franquicia ─────────────────────────────────
    cob = snap.get("coberturas", {})
    c.setFont("Helvetica", 7)
    c.setFillColor(_TINTA)
    if cargos.get("incluye_kilometraje"):
        c.drawString(izq, y, "El precio incluye kilometraje libre.")
        y -= 3.6 * mm
    for contratada in cob.get("contratadas", []):
        txt = f"Cobertura contratada: {contratada['nombre']}"
        if contratada.get("franquicia"):
            txt += f" — franquicia $ {_money(contratada['franquicia'])}"
        c.drawString(izq, y, txt)
        y -= 3.6 * mm

    # El rechazo explícito no es decoración: es la prueba de que se ofreció.
    c.setFillColor(_GRIS)
    for rechazada in cob.get("rechazadas", []):
        c.drawString(izq, y, f"A pesar de la explicación, el arrendatario no desea contratar: {rechazada}.")
        y -= 3.6 * mm

    c.setFillColor(_TINTA)
    c.drawString(izq, y, "Por favor, infórmenos sobre cualquier cambio de fecha y/o lugar de devolución, "
                         "ya que podrían generarse cargos adicionales.")
    y -= 5.5 * mm

    c.setFont("Helvetica-Bold", 9)
    c.drawString(izq, y, f"FRANQUICIA: $ {_money(cob.get('franquicia'))} (responsabilidad del cliente)")
    y -= 8 * mm

    # ── Aceptación y firma ────────────────────────────────────────────────
    c.setFont("Helvetica", 7.5)
    for linea in _wrap(snap.get("aceptacion", ""), "Helvetica", 7.5, util):
        c.drawString(izq, y, linea)
        y -= 3.6 * mm

    # Aire suficiente para que entre una firma arriba de la línea. Hace falta
    # en los dos casos: si está firmado en el sistema, para que el trazo no
    # pise el párrafo de aceptación; si se imprime en blanco, para que quepa
    # una firma de puño y letra.
    y -= 16 * mm

    firma_y = max(y, _MARGEN + 34 * mm)
    c.setStrokeColor(black)
    c.line(izq, firma_y, izq + 70 * mm, firma_y)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(_GRIS)
    c.drawString(izq, firma_y - 3.5 * mm, "Firma del cliente")
    if contrato.firmado_por_nombre:
        c.setFont("Helvetica", 7)
        c.setFillColor(_TINTA)
        c.drawString(izq, firma_y - 7 * mm,
                     f"{contrato.firmado_por_nombre}  ·  DNI {contrato.firmado_por_dni or '—'}")
        # Firmado en papel: no hay trazo que estampar, y sin decirlo la
        # reimpresión se ve igual que un contrato sin firmar. El original es
        # el papel archivado, no este PDF.
        if getattr(contrato, "firma_medio", None) == "papel":
            fecha = contrato.firmado_at.strftime("%d/%m/%Y") if contrato.firmado_at else "—"
            c.setFont("Helvetica-Oblique", 6.5)
            c.setFillColor(_GRIS)
            c.drawString(izq, firma_y - 10.5 * mm,
                         f"Firmado de puño y letra el {fecha}. El ejemplar firmado se archiva en papel.")

    c.setFont("Helvetica", 7.5)
    c.setFillColor(_TINTA)
    c.drawRightString(ancho - _MARGEN, firma_y - 3.5 * mm,
                      f"Usted fue atendido por: {snap.get('atendido_por') or '—'}")

    # ── Pie institucional ─────────────────────────────────────────────────
    emp = snap.get("empresa", {})
    pie_y = _MARGEN + 14 * mm
    c.setStrokeColor(_LINEA)
    c.line(_MARGEN, pie_y + 4 * mm, ancho - _MARGEN, pie_y + 4 * mm)

    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(_TINTA)
    c.drawString(_MARGEN, pie_y, emp.get("razon_social") or emp.get("locador_nombre") or "UBICAR RENT")

    c.setFont("Helvetica", 6.5)
    c.setFillColor(_GRIS)
    izquierda = " · ".join(x for x in [emp.get("domicilio"), emp.get("localidad")] if x)
    centro = " · ".join(x for x in [emp.get("telefonos"), emp.get("email")] if x)
    fiscal = " · ".join(
        x for x in [
            f"CUIT: {emp['cuit']}" if emp.get("cuit") else "",
            f"II.BB: {emp['ingresos_brutos']}" if emp.get("ingresos_brutos") else "",
        ] if x
    )
    c.drawString(_MARGEN, pie_y - 4 * mm, izquierda)
    c.drawCentredString(ancho / 2, pie_y - 4 * mm, centro)
    c.drawRightString(ancho - _MARGEN, pie_y - 4 * mm, fiscal)

    # D-C1 pendiente: mientras no haya CUIT, el papel lo dice. Es lo que evita
    # que el placeholder se vuelva permanente por olvido.
    if not emp.get("cuit"):
        c.setFillColor(HexColor("#B00020"))
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(_MARGEN, pie_y - 8 * mm,
                     "DOCUMENTO PROVISORIO — faltan cargar los datos fiscales del locador.")

    return firma_y


# ─── Reverso ─────────────────────────────────────────────────────────────────

def _reverso(c: canvas.Canvas, plantilla, snap: dict) -> None:
    ancho, alto = A4
    emp = snap.get("empresa", {})
    locador = (emp.get("locador_nombre") or "UBICAR RENT").upper()
    jurisdiccion = emp.get("jurisdiccion") or "Bahía Blanca"

    def resolver(texto: str) -> str:
        return texto.replace("{{LOCADOR}}", locador).replace("{{JURISDICCION}}", jurisdiccion)

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(_TINTA)
    c.drawCentredString(ancho / 2, alto - _MARGEN - 4 * mm, resolver(plantilla.titulo))

    col_ancho = (ancho - 2 * _MARGEN - 6 * mm) / 2
    columnas_x = [_MARGEN, _MARGEN + col_ancho + 6 * mm]
    y_tope = alto - _MARGEN - 12 * mm
    y_piso = _MARGEN + 8 * mm

    estado = {"col": 0, "y": y_tope}
    tam = 5.6
    interlinea = 2.5 * mm

    def hay_lugar(alto_necesario: float) -> bool:
        """
        Pasa a la segunda columna cuando la primera se llena. Devuelve False si
        ya no queda espacio: es preferible que el texto se corte de forma
        visible antes que pisar una cláusula encima de otra.
        """
        if estado["y"] - alto_necesario >= y_piso:
            return True
        if estado["col"] == 0:
            estado["col"] = 1
            estado["y"] = y_tope
            return True
        return False

    for clausula in plantilla.clausulas:
        titulo = f"{clausula['numero']}. {resolver(clausula.get('titulo', ''))}"
        if not hay_lugar(interlinea * 2):
            break
        c.setFont("Helvetica-Bold", tam + 0.4)
        c.setFillColor(_TINTA)
        c.drawString(columnas_x[estado["col"]], estado["y"], titulo)
        estado["y"] -= interlinea * 1.2

        for parrafo in clausula.get("parrafos", []):
            texto = resolver(parrafo.get("texto", ""))
            subrayados = parrafo.get("subrayados") or []
            lineas = _wrap(texto, "Helvetica", tam, col_ancho)

            # Los subrayados vienen como rangos de caracteres sobre el texto
            # completo; se traducen a "cuántas líneas del principio van
            # subrayadas", que es lo que se puede dibujar sin partir palabras.
            hasta_char = max((s[1] for s in subrayados), default=0)
            acumulado = 0
            for linea in lineas:
                if not hay_lugar(interlinea):
                    return
                c.setFont("Helvetica", tam)
                c.setFillColor(_TINTA)
                x = columnas_x[estado["col"]]
                c.drawString(x, estado["y"], linea)
                if hasta_char and acumulado < hasta_char:
                    w = stringWidth(linea, "Helvetica", tam)
                    c.setStrokeColor(_TINTA)
                    c.setLineWidth(0.3)
                    c.line(x, estado["y"] - 0.9, x + w, estado["y"] - 0.9)
                acumulado += len(linea) + 1
                estado["y"] -= interlinea
            estado["y"] -= interlinea * 0.3

        estado["y"] -= interlinea * 0.4

    c.setFont("Helvetica", 5)
    c.setFillColor(_GRIS)
    c.drawRightString(
        ancho - _MARGEN, _MARGEN + 3 * mm,
        f"Condiciones Generales v{plantilla.version} — vigentes desde "
        f"{plantilla.vigente_desde.strftime('%d/%m/%Y')}",
    )


# ─── Entrada ─────────────────────────────────────────────────────────────────

def generar_pdf_contrato(contrato, plantilla, firma_bytes: bytes | None = None) -> bytes:
    """
    Renderiza el contrato desde su **snapshot congelado** y la **versión del
    clausulado con la que se firmó** — nunca desde las tablas vivas. Es lo que
    hace que reimprimirlo dentro de dos años dé el mismo papel.
    """
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    snap = contrato.snapshot or {}

    firma_y = _anverso(c, contrato, snap)

    if firma_bytes:
        try:
            # Apoyada sobre la línea de firma, no en una posición fija: la
            # línea se mueve según el largo del detalle de cargos.
            c.drawImage(
                ImageReader(BytesIO(firma_bytes)),
                _MARGEN, firma_y + 1.5 * mm, width=52 * mm, height=13 * mm,
                preserveAspectRatio=True, anchor="sw", mask="auto",
            )
        except Exception:
            # Una firma ilegible no puede impedir reimprimir el contrato.
            pass

    c.showPage()
    _reverso(c, plantilla, snap)
    c.showPage()
    c.save()
    return buffer.getvalue()
