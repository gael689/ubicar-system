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


def _fila_repartida(
    c: canvas.Canvas, x: float, y: float, ancho: float, partes: list[str],
    fuente: str = "Helvetica", tam: float = 6.5, interlinea: float = 3.2 * mm,
) -> float:
    """Dibuja varios segmentos en una fila, repartidos a lo ancho — **o los
    apila si no entran**. Devuelve la `y` de la última línea usada.

    Existe porque el pie del contrato se estaba pisando: los tres segmentos se
    dibujaban con `drawString` a la izquierda, `drawCentredString` en
    `ancho/2` y `drawRightString` a la derecha, **los tres en la misma `y` y
    ninguno declarando un ancho**. El centrado se calcula contra la página
    entera, no contra el hueco que dejó el de la izquierda; cuando el
    domicilio del locador creció con los datos fiscales reales, la cola de
    "…Provincia de Buenos Aires" se metió encima del teléfono. ReportLab no
    tiene noción de colisión: simplemente imprime uno sobre otro.

    La corrección no es correr coordenadas unos milímetros. Es que el ancho
    pase a ser un dato del layout y no una suposición: cualquier valor que
    carguen mañana desde Configuración o entra repartido, o se apila, pero
    **nunca se superpone**.
    """
    partes = [p for p in partes if p]
    if not partes:
        return y

    c.setFont(fuente, tam)
    anchos = [stringWidth(p, fuente, tam) for p in partes]
    separacion_minima = 6 * mm

    if len(partes) == 1:
        c.drawString(x, y, partes[0])
        return y

    if sum(anchos) + separacion_minima * (len(partes) - 1) <= ancho:
        # Entran: se reparte el sobrante en huecos iguales. El del medio se
        # ancla al hueco real, no al centro de la página — que es lo que
        # producía el choque.
        hueco = (ancho - sum(anchos)) / (len(partes) - 1)
        cursor = x
        for texto, w in zip(partes, anchos):
            c.drawString(cursor, y, texto)
            cursor += w + hueco
        return y

    # No entran: se apilan, cada uno cortado al ancho disponible.
    for texto in partes:
        for linea in _wrap(texto, fuente, tam, ancho):
            c.drawString(x, y, linea)
            y -= interlinea
    return y + interlinea


def etiqueta_documento(documento, es_empresa: bool = False) -> str:
    """
    "CUIT" o "DNI" según quién es. Una empresa siempre tiene CUIT; para una
    persona, 11 dígitos son un CUIT/CUIL y cualquier otra cosa un DNI.

    Antes el papel decía "DNI / CUIT" para todos, que es no decir nada.
    """
    digitos = "".join(ch for ch in str(documento or "") if ch.isdigit())
    return "CUIT" if es_empresa or len(digitos) == 11 else "DNI"


# ─── Anverso ─────────────────────────────────────────────────────────────────

def _campo(
    c: canvas.Canvas, x: float, y: float, etiqueta: str, valor,
    tam: float = 7.5, ancho: float | None = None,
) -> float:
    """Una fila "etiqueta / valor". Devuelve la `y` de la fila siguiente.

    `ancho` es el de la columna. Sin él, el valor se dibujaba sin ningún
    límite y con un lugar de retiro largo —"Aeropuerto Comandante Espora"—
    ya estaba invadiendo la columna de la derecha. El corte prefiere una
    línea de más antes que texto encima de texto.
    """
    c.setFont("Helvetica", tam - 1)
    c.setFillColor(_GRIS)
    c.drawString(x, y, etiqueta)

    c.setFont("Helvetica-Bold", tam)
    c.setFillColor(_TINTA)
    texto = str(valor if valor not in (None, "") else "—")
    x_valor = x + 32 * mm

    if ancho is None:
        c.drawString(x_valor, y, texto)
        return y - 4.2 * mm

    disponible = ancho - 32 * mm
    lineas = _wrap(texto, "Helvetica-Bold", tam, disponible) or [texto]
    for linea in lineas:
        c.drawString(x_valor, y, linea)
        y -= 4.2 * mm
    return y


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

    # Las dos identidades, juntas y desde arriba. El cliente llegó por "Ubicar
    # Rent" y el logo dice eso, pero quien se obliga en las trece cláusulas es
    # la sociedad. Que el papel no lo aclare deja que alguien discuta después
    # contra quién firmó.
    emp_cab = snap.get("empresa", {})
    comercial = emp_cab.get("nombre_comercial")
    legal = emp_cab.get("razon_social") or emp_cab.get("locador_nombre")
    if comercial and legal and comercial.strip().lower() != legal.strip().lower():
        c.setFont("Helvetica", 7)
        c.setFillColor(_GRIS)
        c.drawString(_MARGEN, alto - _MARGEN - 14.5 * mm,
                     f"{comercial} es el nombre comercial de {legal}"
                     + (f" — CUIT {emp_cab['cuit']}" if emp_cab.get("cuit") else ""))

    c.setFont("Helvetica", 8)
    c.setFillColor(_TINTA)
    c.drawRightString(ancho - _MARGEN, alto - _MARGEN - 18 * mm,
                      f"Número de Contrato: {contrato.numero_formateado}")

    y = alto - _MARGEN - 26 * mm
    izq, der = _MARGEN, _MARGEN + col + 6 * mm

    # ── Retiro (izq) y Devolución (der) ───────────────────────────────────
    # Pedido del cliente (27/09, txt 22): "la devolución por un lado y el
    # retiro por el otro". Antes las dos iban apiladas en la columna izquierda
    # como "Check Out"/"Check In" —jerga que el cliente no usa— y los km y el
    # combustible quedaban sueltos debajo, sin decir si eran de la salida o de
    # la vuelta.
    servicio = snap.get("servicio", {})
    vehiculo = snap.get("vehiculo", {})
    en_blanco = "______________"

    y_izq = _titulo_bloque(c, izq, y, col, "Retiro")
    y_izq = _campo(c, izq, y_izq, "Fecha", _fecha(servicio.get("check_out_fecha")), ancho=col)
    y_izq = _campo(c, izq, y_izq, "Hora", servicio.get("check_out_hora"), ancho=col)
    # El lugar es el valor más largo del bloque ("Aeropuerto Comandante
    # Espora"): con el ancho declarado se corta en vez de invadir la columna.
    y_izq = _campo(c, izq, y_izq, "Lugar", servicio.get("check_out_lugar"), ancho=col)
    # Un contrato emitido antes de la entrega todavía no tiene km ni
    # combustible de salida. Se imprime una línea para completar a mano, no
    # "None km": el papel se firma en el mostrador y ese dato se anota ahí.
    _km = servicio.get("check_out_km")
    _comb = servicio.get("check_out_combustible")
    y_izq = _campo(c, izq, y_izq, "Km salida", f"{_km} km" if _km is not None else en_blanco, ancho=col)
    y_izq = _campo(c, izq, y_izq, "Combustible", f"{_comb} %" if _comb is not None else en_blanco, ancho=col)

    y_der = _titulo_bloque(c, der, y, col, "Devolución")
    y_der = _campo(c, der, y_der, "Fecha", _fecha(servicio.get("check_in_fecha")), ancho=col)
    y_der = _campo(c, der, y_der, "Hora", servicio.get("check_in_hora"), ancho=col)
    y_der = _campo(c, der, y_der, "Lugar", servicio.get("check_in_lugar"), ancho=col)
    # Los de llegada casi nunca se conocen al firmar: línea para completar.
    _km_in = servicio.get("check_in_km")
    _comb_in = servicio.get("check_in_combustible")
    y_der = _campo(c, der, y_der, "Km llegada", f"{_km_in} km" if _km_in is not None else en_blanco, ancho=col)
    y_der = _campo(c, der, y_der, "Combustible", f"{_comb_in} %" if _comb_in is not None else en_blanco, ancho=col)

    y = min(y_izq, y_der) - 1 * mm

    # ── Vehículo y datos administrativos, debajo y en una sola franja ─────
    y = _campo(c, izq, y, "Vehículo", vehiculo.get("descripcion") or "—", ancho=util)
    admin = [
        f"Cliente N° {(snap.get('cliente') or {}).get('id') or '—'}",
        f"Reserva N° {snap.get('reserva_id') or '—'}",
        f"Patente {vehiculo.get('patente') or '—'}",
        f"Interno {vehiculo.get('interno') or '—'}",
        f"Categoría {vehiculo.get('categoria') or '—'}",
    ]
    c.setFillColor(_GRIS)
    y = _fila_repartida(c, izq, y, util, admin, tam=7) - 6 * mm
    c.setFillColor(_TINTA)

    # ── Arrendatario (izq) y conductores (der) ────────────────────────────
    cli = snap.get("cliente", {})
    rep = snap.get("representante") or {}
    # `conductores` existe desde la migración 100. Un contrato anterior sólo
    # tiene `conductor_adicional` (uno o ninguno) y se reimprime con ese.
    conductores = snap.get("conductores")
    if conductores is None:
        viejo = snap.get("conductor_adicional") or {}
        conductores = [viejo] if viejo.get("nombre") else []
    conductores = [x for x in conductores if (x or {}).get("nombre")][:3]
    es_empresa = cli.get("tipo") == "empresa" or bool(cli.get("empresa")) or bool(rep)
    doc_cli = cli.get("dni_cuit")
    etiqueta_doc = etiqueta_documento(doc_cli, es_empresa)

    # Para una empresa el arrendatario es la empresa —con quien la representa—
    # y quien maneja va aparte. Antes la empresa salía impresa bajo
    # "Conductor", con los datos de licencia vacíos, y el chofer real sólo
    # como "Segundo Conductor".
    y_izq = _titulo_bloque(c, izq, y, col, "Arrendatario")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(_TINTA)
    for linea in _wrap((cli.get("nombre") or "—").upper(), "Helvetica-Bold", 9, col) or ["—"]:
        c.drawString(izq, y_izq, linea)
        y_izq -= 4 * mm
    c.setFont("Helvetica", 7.5)
    for linea in [
        cli.get("domicilio") or "",
        " ".join(x for x in [cli.get("codigo_postal"), cli.get("localidad")] if x),
        cli.get("pais") or "",
    ]:
        if linea:
            for parte in _wrap(linea, "Helvetica", 7.5, col):
                c.drawString(izq, y_izq, parte)
                y_izq -= 3.6 * mm
    y_izq -= 1 * mm
    y_izq = _campo(c, izq, y_izq, etiqueta_doc, doc_cli, ancho=col)
    if cli.get("empresa"):
        y_izq = _campo(c, izq, y_izq, "Razón social", cli.get("empresa"), ancho=col)
    if rep.get("nombre"):
        rep_txt = rep["nombre"] + (f" ({rep['cargo']})" if rep.get("cargo") else "")
        y_izq = _campo(c, izq, y_izq, "Representante", rep_txt, ancho=col)
        if rep.get("dni"):
            y_izq = _campo(c, izq, y_izq, "DNI representante", rep.get("dni"), ancho=col)
    if not es_empresa:
        registro = ", ".join(x for x in [
            cli.get("licencia_numero"),
            _fecha(cli.get("licencia_vencimiento")) if cli.get("licencia_vencimiento") else "",
            cli.get("licencia_pais"), cli.get("licencia_categoria"),
        ] if x and x != "—")
        y_izq = _campo(c, izq, y_izq, "Registro", registro, ancho=col)

    titulo_der = "Conductores autorizados" if len(conductores) > 1 else "Conductor"
    y_der = _titulo_bloque(c, der, y, col, titulo_der)
    if not conductores:
        # Sin conductores designados maneja el titular (regla de siempre). Una
        # empresa no maneja: se deja la línea para completar a mano.
        c.setFont("Helvetica", 7.5)
        c.setFillColor(_TINTA)
        c.drawString(der, y_der, "El arrendatario." if not es_empresa else "A designar: ______________________")
        y_der -= 4.2 * mm
    for i, cond in enumerate(conductores, start=1):
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(_TINTA)
        nombre = (cond.get("nombre") or "").upper()
        if len(conductores) > 1:
            nombre = f"{i}. {nombre}"
        for linea in _wrap(nombre, "Helvetica-Bold", 8, col) or [nombre]:
            c.drawString(der, y_der, linea)
            y_der -= 3.6 * mm
        # La cláusula 2.h pide nombre, documento y dirección para que la
        # autorización del conductor sea válida.
        licencia = cond.get("licencia_numero") or ""
        if cond.get("licencia_vencimiento"):
            licencia += f" (vto. {_fecha(cond.get('licencia_vencimiento'))})"
        detalle = " · ".join([
            f"DNI {cond['dni']}" if cond.get("dni") else "DNI ________",
            f"Licencia {licencia.strip()}" if licencia.strip() else "Licencia ________",
        ])
        c.setFont("Helvetica", 7)
        for linea in _wrap(detalle, "Helvetica", 7, col):
            c.drawString(der, y_der, linea)
            y_der -= 3.3 * mm
        if cond.get("domicilio"):
            for linea in _wrap(f"Domicilio: {cond['domicilio']}", "Helvetica", 7, col):
                c.drawString(der, y_der, linea)
                y_der -= 3.3 * mm
        y_der -= 1 * mm

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
    # **Dice "según contrato" y no "kilometraje libre".** El contrato es el
    # documento que fija el régimen; afirmar acá que es libre, y que la web
    # prometa lo mismo, es lo que convierte un desacuerdo en un reclamo con
    # respaldo escrito. Se cambió junto con el sitio, en la misma tanda.
    #
    # La clave del snapshot se renombró con el texto (`incluye_kilometraje` →
    # `kilometraje_segun_contrato`): un contrato viejo, reimpreso, no trae la
    # clave nueva y por lo tanto **no imprime esta línea**, que es lo correcto
    # — se firmó con otro texto y el snapshot está congelado a propósito.
    if cargos.get("kilometraje_segun_contrato"):
        c.drawString(izq, y, "El kilometraje se rige por lo pactado en este contrato.")
        y -= 3.6 * mm

    # Las dos líneas que van siempre, como en el contrato modelo: lo que el
    # canon incluye pase lo que pase. **La exención y el seguro son cosas
    # distintas y por eso son dos líneas**: el seguro cubre a terceros, la
    # exención limita lo que se le puede reclamar al CLIENTE por el Vehículo.
    # Juntarlas en una sola línea es lo que hace que alguien entienda "estoy
    # cubierto".
    c.drawString(izq, y, "Exención por Daños (LDW)")
    y -= 3.6 * mm
    c.drawString(izq, y, "Seguro a terceros")
    y -= 3.6 * mm

    for contratada in cob.get("contratadas", []):
        # El asterisco viene congelado del snapshot y remite a la cláusula 5.
        txt = f"Cobertura contratada: {contratada['nombre']}{contratada.get('marca') or ''}"
        # **Se imprime cuánto BAJA, no cuánto queda** (migración 084).
        #
        # El número que queda es uno solo para toda la operación y va abajo, en
        # la línea grande de "SEGURO CON FRANQUICIA DE $ X". Repetirlo por
        # cobertura era lo que hacía el contrato antes, y con más de una línea
        # habría dicho dos franquicias distintas en el mismo papel.
        #
        # Lo que sí aporta acá es el descuento: explica de dónde sale el número
        # de abajo y deja constancia de qué compró el cliente cuando pagó el
        # 10 % o el 30 % extra.
        #
        # `is not None` y no un chequeo de verdad: un descuento que por lo que
        # sea quedara en cero tiene que verse, no desaparecer en silencio —
        # justamente porque un cliente que pagó por una cobertura y no la ve en
        # el papel es un reclamo.
        if contratada.get("descuento") is not None:
            txt += f" — baja la franquicia en $ {_money(contratada['descuento'])}"
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

    # Plan de conexión (13/08), §3.2 + D-53: "seguro con franquicia de $X",
    # no "franquicia a cargo del cliente" — el seguro obligatorio corre
    # siempre, la franquicia es lo que ese seguro no cubre. Y **nunca se
    # imprime $0 por default**: sin la base cargada para esta categoría
    # (`Categoria.franquicia_base`), `cob['franquicia']` viene `None` y acá
    # se omite la línea entera en vez de mentir un número — la campana ya lo
    # reclama (`categoria_sin_franquicia`).
    franquicia_final = cob.get("franquicia")
    c.setFont("Helvetica-Bold", 9)
    if franquicia_final is not None:
        # **La franquicia no entra en el total y no es un cargo.** Es lo que el
        # CLIENTE pone si rompe el auto, no lo que paga hoy: por eso se imprime
        # acá abajo, fuera de la tabla de cargos y después del Valor Estimado,
        # igual que en el contrato modelo. Meterla como una línea más de la
        # tabla la sumaría al alquiler, que es exactamente lo que no es.
        c.drawString(izq, y, f"FRANQUICIA: $ {_money(franquicia_final)} (responsabilidad del cliente)")
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

    c.setFillColor(_GRIS)
    izquierda = " · ".join(x for x in [emp.get("domicilio"), emp.get("localidad")] if x)
    centro = " · ".join(x for x in [emp.get("telefonos"), emp.get("email")] if x)
    fiscal = " · ".join(
        x for x in [
            f"CUIT: {emp['cuit']}" if emp.get("cuit") else "",
            f"II.BB: {emp['ingresos_brutos']}" if emp.get("ingresos_brutos") else "",
        ] if x
    )
    # Repartidos con el ancho útil declarado. Antes eran tres `draw*` sueltos
    # en la misma `y` y el domicilio real terminaba encima del teléfono.
    ultima_y = _fila_repartida(
        c, _MARGEN, pie_y - 4 * mm, ancho - 2 * _MARGEN, [izquierda, centro, fiscal],
    )

    # D-C1 pendiente: mientras no haya CUIT, el papel lo dice. Es lo que evita
    # que el placeholder se vuelva permanente por olvido.
    #
    # Va debajo de la última línea que realmente se dibujó, no a una distancia
    # fija del pie: si los datos se apilaron, una posición fija caería encima.
    if not emp.get("cuit"):
        c.setFillColor(HexColor("#B00020"))
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(_MARGEN, ultima_y - 4 * mm,
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

    # Las cláusulas editadas para este contrato mandan sobre la plantilla.
    for clausula in (snap.get("clausulas") or plantilla.clausulas):
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
    pie = (
        f"Condiciones Generales v{plantilla.version} — vigentes desde "
        f"{plantilla.vigente_desde.strftime('%d/%m/%Y')}"
    )
    modificadas = snap.get("clausulas_modificadas") or []
    if modificadas:
        pie += " — modificadas para este contrato: " + ", ".join(str(n) for n in modificadas)
    c.drawRightString(ancho - _MARGEN, _MARGEN + 3 * mm, pie)


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
