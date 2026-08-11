"""
Las plantillas de los mails que el sistema le manda al cliente.

**Son funciones puras**: reciben las entidades ya cargadas y devuelven
`(asunto, html)`. No tocan la base, no envían nada y no saben si Resend
existe. Eso permite armarlas con datos de ejemplo y mirarlas sin mandar un
solo mail — que es exactamente lo que hace falta mientras el dominio no esté
verificado.

Decisiones de forma, para que no se vuelvan a discutir en cada plantilla:

- **HTML plano con estilos inline y tablas.** Gmail, Outlook y las apps de
  teléfono descartan el `<style>` del head y buena parte del CSS moderno. Un
  diseño con flexbox se ve perfecto en el navegador y roto en la casilla del
  cliente, que es el único lugar donde importa.
- **Nada de imágenes remotas.** Casi todos los clientes de mail bloquean las
  imágenes por defecto: un mail cuyo contenido vive en un `<img>` llega vacío.
  El encabezado es texto.
- **El monto siempre con su concepto al lado.** Un mail de cierre que dice
  "$45.000" y nada más genera un llamado; uno que dice "combustible faltante
  $45.000" se entiende solo.
"""
from __future__ import annotations

from decimal import Decimal
from html import escape

# El tono de la marca. Gris oscuro sobre blanco: se lee igual en el modo
# oscuro de Gmail, que invierte los fondos y arruina cualquier color de fondo
# saturado.
_TINTA = "#111111"
_SUAVE = "#666666"
_BORDE = "#e4e4e7"


def pesos(monto: Decimal | float | str | None) -> str:
    """`1234.5` → `$1.234,50`. Formato argentino, punto de miles y coma."""
    if monto is None:
        return "$0,00"
    return f"${Decimal(str(monto)):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def _e(valor) -> str:
    """Todo lo que viene de la base entra escapado: un cliente que se llama
    `Martínez & Cía <SRL>` no puede romper el HTML del mail."""
    return escape(str(valor if valor is not None else ""), quote=False)


def _filas(pares: list[tuple[str, str]]) -> str:
    """Una tabla etiqueta/valor. Se saltean las filas sin valor: un renglón
    'Devolución: —' ocupa lugar y no dice nada."""
    filas = "".join(
        f'<tr><td style="padding:4px 16px 4px 0;color:{_SUAVE};font-size:13px;'
        f'white-space:nowrap;vertical-align:top">{etiqueta}</td>'
        f'<td style="padding:4px 0;font-size:14px;color:{_TINTA}">{valor}</td></tr>'
        for etiqueta, valor in pares
        if valor
    )
    return f'<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">{filas}</table>'


def layout(titulo: str, cuerpo: str, empresa: dict | None = None) -> str:
    """El marco común: título, contenido y pie con los datos de la empresa."""
    empresa = empresa or {}
    marca = _e(empresa.get("nombre_comercial") or "Ubicar Rent")
    contacto = " · ".join(
        p for p in (_e(empresa.get("telefonos")), _e(empresa.get("email"))) if p
    )
    legal = _e(empresa.get("razon_social") or "")
    return f"""
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
            max-width:560px;margin:0 auto;padding:24px;color:{_TINTA};background:#ffffff">
  <p style="margin:0 0 20px;font-size:12px;letter-spacing:.08em;
            text-transform:uppercase;color:{_SUAVE}">{marca}</p>
  <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.3">{titulo}</h1>
  {cuerpo}
  <hr style="border:none;border-top:1px solid {_BORDE};margin:28px 0 12px">
  <p style="margin:0;font-size:12px;color:{_SUAVE};line-height:1.6">
    {marca}{f" — {legal}" if legal else ""}<br>{contacto}
  </p>
</div>
""".strip()


def _nombre_cliente(reserva) -> str:
    """Con quién hablamos. El contacto de la web gana sobre la ficha: en una
    reserva web puede no haber cliente todavía."""
    nombre = getattr(reserva, "web_contacto_nombre", None)
    if not nombre and getattr(reserva, "cliente", None):
        nombre = reserva.cliente.nombre_completo
    return _e((nombre or "").split(" ")[0])


def email_del_cliente(reserva) -> str | None:
    """A qué casilla escribirle. Misma prioridad que el nombre."""
    if reserva is None:
        return None
    directo = getattr(reserva, "web_contacto_email", None)
    if directo:
        return directo
    cliente = getattr(reserva, "cliente", None)
    return getattr(cliente, "email", None) if cliente else None


def _vehiculo_o_categoria(reserva) -> str:
    """El auto si ya está asignado; si no, la categoría. Una reserva web nace
    por categoría y no tiene patente hasta que alguien le asigna una unidad."""
    vehiculo = getattr(reserva, "vehiculo", None)
    if vehiculo is not None:
        modelo = f"{vehiculo.marca} {vehiculo.modelo}".strip()
        return _e(f"{modelo} ({vehiculo.patente})" if vehiculo.patente else modelo)
    categoria = getattr(reserva, "categoria", None)
    return _e(categoria.nombre) if categoria is not None else ""


def _cuando(fecha, hora, lugar: str | None) -> str:
    partes = [fecha.strftime("%d/%m/%Y")]
    if hora is not None:
        partes.append(hora.strftime("%H:%M"))
    texto = " ".join(partes)
    return f"{texto} — {_e(lugar)}" if lugar else texto


# ── 1. Reserva confirmada ────────────────────────────────────────────────────

def reserva_confirmada(reserva, empresa: dict | None = None, pago_web=None) -> tuple[str, str]:
    """
    El comprobante de quien reservó.

    `pago_web` es opcional: la misma plantilla sirve para una reserva pagada
    online (donde hay anticipo y saldo) y para una cargada en el mostrador
    (donde no hay ninguno de los dos). Antes había dos mails distintos para lo
    mismo, y sólo uno se mantenía.
    """
    bloque_pago = ""
    if pago_web is not None:
        saldo = (
            Decimal(str(pago_web.total_reserva))
            - Decimal(str(pago_web.descuento_pago_total))
            - Decimal(str(pago_web.monto))
        )
        bloque_pago = (
            f'<p style="margin:16px 0 0;font-size:14px">Recibimos tu pago de '
            f"<strong>{pesos(pago_web.monto)}</strong>. "
            + (
                f"Al retirar el vehículo abonás el saldo de <strong>{pesos(saldo)}</strong>."
                if saldo > 0
                else "Tu alquiler está <strong>pagado en su totalidad</strong>."
            )
            + "</p>"
        )
    elif reserva.precio_total:
        bloque_pago = (
            f'<p style="margin:16px 0 0;font-size:14px">Total del alquiler: '
            f"<strong>{pesos(reserva.precio_total)}</strong>.</p>"
        )

    cuerpo = f"""
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
    Hola {_nombre_cliente(reserva)}, tu reserva quedó registrada con el
    número <strong>#{reserva.id}</strong>.
  </p>
  {_filas([
      ("Vehículo", _vehiculo_o_categoria(reserva)),
      ("Retiro", _cuando(reserva.fecha_inicio, reserva.hora_inicio, reserva.lugar_entrega)),
      ("Devolución", _cuando(reserva.fecha_fin, reserva.hora_fin, reserva.lugar_devolucion)),
  ])}
  {bloque_pago}
  <p style="margin:20px 0 0;font-size:13px;color:{_SUAVE};line-height:1.6">
    Para retirar el vehículo necesitás <strong>DNI y licencia de conducir
    vigente</strong>. Si necesitás cambiar fechas o el lugar de devolución,
    avisanos antes: puede generar cargos adicionales.
  </p>
"""
    return f"Reserva confirmada #{reserva.id}", layout("Tu reserva está confirmada", cuerpo, empresa)


# ── 2. Check-out (retiro del vehículo) ───────────────────────────────────────

_LIMPIEZA = {
    "limpio": "limpio",
    "sucio": "sucio",
    "requiere_lavado_profundo": "requiere lavado profundo",
}


def checkout(alquiler, empresa: dict | None = None) -> tuple[str, str]:
    """
    La constancia de lo que se entregó.

    **Es un acta, no una cortesía.** Kilómetros, combustible y estado al salir
    son exactamente los números contra los que se van a comparar los de la
    devolución: si el cliente los tiene por escrito desde el primer día, la
    discusión del cierre se resuelve sola. Por eso el detalle va acá y no en un
    resumen amable.
    """
    reserva = alquiler.reserva
    garantia = ""
    if alquiler.garantia_tipo and alquiler.garantia_tipo != "no_aplica":
        garantia = f"{pesos(alquiler.garantia_monto)} en {_e(alquiler.garantia_tipo)}"

    cuerpo = f"""
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
    Hola {_nombre_cliente(reserva)}, te entregamos el vehículo. Esto es lo que
    quedó registrado al salir:
  </p>
  {_filas([
      ("Vehículo", _vehiculo_o_categoria(reserva)),
      ("Entrega", _cuando(alquiler.checkout_fecha, alquiler.checkout_hora, reserva.lugar_entrega)),
      ("Kilómetros", f"{alquiler.checkout_km:,}".replace(",", ".") + " km"),
      ("Combustible", f"{alquiler.checkout_combustible}%"),
      ("Estado", _e(_LIMPIEZA.get(alquiler.checkout_estado_limpieza or "", ""))),
      ("Garantía retenida", garantia),
      ("Devolución pactada", _cuando(reserva.fecha_fin, reserva.hora_fin, reserva.lugar_devolucion)),
  ])}
  <p style="margin:20px 0 0;font-size:13px;color:{_SUAVE};line-height:1.6">
    Guardá este mail: son los datos contra los que se compara la devolución.
    Si vas a devolverlo más tarde de la hora pactada, avisanos antes — la
    demora tiene un cargo por hora.
  </p>
"""
    return (
        f"Retiro registrado — reserva #{reserva.id}",
        layout("Constancia de entrega", cuerpo, empresa),
    )


# ── 3. Check-in (devolución) ─────────────────────────────────────────────────

def checkin(alquiler, empresa: dict | None = None) -> tuple[str, str]:
    """
    El cierre, con los cargos si los hubo.

    **Los cargos se listan uno por uno, con su concepto.** Un total sin
    desglose es el motivo número uno por el que alguien llama al día
    siguiente; y cuando no hubo ningún cargo, decirlo explícitamente vale
    tanto como cobrarlo bien.
    """
    reserva = alquiler.reserva
    cargos: list[tuple[str, Decimal]] = []
    if alquiler.cargo_excedente and alquiler.cargo_excedente > 0:
        cargos.append(("Demora en la devolución", alquiler.cargo_excedente))
    if alquiler.cargo_combustible and alquiler.cargo_combustible > 0:
        cargos.append(("Combustible faltante", alquiler.cargo_combustible))
    if alquiler.cargo_limpieza and alquiler.cargo_limpieza > 0:
        cargos.append(("Limpieza", alquiler.cargo_limpieza))

    if cargos:
        total = sum((c[1] for c in cargos), Decimal("0"))
        detalle = "".join(
            f'<tr><td style="padding:4px 16px 4px 0;font-size:14px">{concepto}</td>'
            f'<td style="padding:4px 0;font-size:14px;text-align:right">{pesos(monto)}</td></tr>'
            for concepto, monto in cargos
        )
        bloque_cargos = f"""
  <p style="margin:20px 0 8px;font-size:14px;font-weight:600">Cargos de cierre</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:360px">
    {detalle}
    <tr><td style="padding:8px 16px 0 0;font-size:14px;font-weight:600;
                   border-top:1px solid {_BORDE}">Total</td>
        <td style="padding:8px 0 0;font-size:14px;font-weight:600;text-align:right;
                   border-top:1px solid {_BORDE}">{pesos(total)}</td></tr>
  </table>
"""
    else:
        bloque_cargos = (
            f'<p style="margin:20px 0 0;font-size:14px">La devolución no generó '
            f"<strong>ningún cargo adicional</strong>.</p>"
        )

    garantia = ""
    if alquiler.garantia_estado == "devuelta":
        garantia = "Devuelta en su totalidad"
    elif alquiler.garantia_estado == "ejecutada_parcial":
        garantia = f"Se devolvieron {pesos(alquiler.garantia_monto_devuelto)} de {pesos(alquiler.garantia_monto)}"

    cuerpo = f"""
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
    Hola {_nombre_cliente(reserva)}, recibimos el vehículo. Gracias por
    elegirnos.
  </p>
  {_filas([
      ("Vehículo", _vehiculo_o_categoria(reserva)),
      ("Devolución", _cuando(alquiler.checkin_fecha, alquiler.checkin_hora, reserva.lugar_devolucion)),
      ("Kilómetros", (f"{alquiler.checkin_km:,}".replace(",", ".") + " km") if alquiler.checkin_km is not None else ""),
      ("Recorridos", (f"{alquiler.checkin_km - alquiler.checkout_km:,}".replace(",", ".") + " km") if alquiler.checkin_km is not None else ""),
      ("Garantía", garantia),
  ])}
  {bloque_cargos}
  <p style="margin:20px 0 0;font-size:13px;color:{_SUAVE};line-height:1.6">
    Si algo de este detalle no coincide con lo que acordamos, escribinos
    respondiendo este mail.
  </p>
"""
    return (
        f"Devolución registrada — reserva #{reserva.id}",
        layout("Cerramos tu alquiler", cuerpo, empresa),
    )


# ── 4. Ofertas y descuentos (envío manual) ───────────────────────────────────

def oferta(
    titulo: str,
    cuerpo_texto: str,
    empresa: dict | None = None,
    nombre: str | None = None,
) -> tuple[str, str]:
    """
    El único mail que no dispara ningún flujo: lo escribe una persona y lo
    manda a mano desde el sistema.

    El cuerpo llega como **texto plano** y se convierte acá: cada línea en
    blanco abre un párrafo. Quien escribe una promoción no debería tener que
    saber HTML, y aceptar HTML desde un formulario es aceptar que un
    copiar/pegar de Word rompa el mail de todo el mundo.
    """
    parrafos = "".join(
        f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6">{_e(bloque.strip())}</p>'
        for bloque in cuerpo_texto.split("\n\n")
        if bloque.strip()
    )
    saludo = (
        f'<p style="margin:0 0 12px;font-size:14px">Hola {_e(nombre.split(" ")[0])},</p>'
        if nombre
        else ""
    )
    cuerpo = f"""
  {saludo}
  {parrafos}
  <p style="margin:20px 0 0;font-size:12px;color:{_SUAVE};line-height:1.6">
    Recibís este mail porque alquilaste con nosotros. Si no querés recibir
    novedades, respondé este mensaje y te damos de baja.
  </p>
"""
    return titulo, layout(_e(titulo), cuerpo, empresa)
