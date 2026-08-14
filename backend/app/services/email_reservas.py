from __future__ import annotations
"""
Los dos mails que dispara una reserva web, en el momento (PLAN_DEPLOY §5.2).

**Por qué no alcanza el digest de las 08:00.** Una reserva que entra el sábado
a la tarde quedaría sin respuesta hasta el lunes. Para el equipo eso es una
venta que se enfría; para el cliente que acaba de pagar es no recibir nada
después de poner plata, que es el momento exacto en que llama por teléfono
preguntando si la reserva existe.

Son dos destinatarios con necesidades distintas:

- **El equipo** necesita saber que hay algo para atender, con lo mínimo para
  decidir: quién, qué categoría, qué fechas y si hay que resolver algo raro.
- **El cliente** necesita el comprobante de lo que reservó y de lo que falta
  pagar, más dónde y cuándo retira.

Lo que va al cliente ya no se arma acá: es la plantilla `reserva_confirmada`
de `email_plantillas.py`, la misma que se puede reenviar a mano desde el
panel. Tener dos comprobantes distintos para el mismo hecho garantizaba que
uno de los dos quedara desactualizado — y quedó.

Todo sale por `EmailService`, así que cada intento queda registrado y ninguna
falla puede tumbar la acreditación del pago.
"""
import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.services.email_plantillas import layout, pesos

logger = logging.getLogger(__name__)

# D-32b. Vive en `configuracion` y no en una variable de entorno para que los
# dueños puedan cambiar la casilla sin un deploy — que es exactamente lo que
# arregló la migración 048 para `web.hold_minutos`.
CLAVE_DESTINATARIOS = "web.emails_aviso_reserva"


def destinatarios_equipo(db: Session) -> list[str]:
    """
    A quién se le avisa.

    Cae a los destinatarios del digest si la clave está vacía: es mejor que le
    llegue al mismo lugar que el resumen matutino a que no le llegue a nadie.
    """
    from app.services.configuracion_service import ConfiguracionService

    conf = ConfiguracionService(db)
    try:
        crudo = conf.get(CLAVE_DESTINATARIOS).valor or ""
    except Exception:
        crudo = ""
    if not crudo.strip():
        crudo = settings.notificaciones_digest_destinatarios or ""
    return [d.strip() for d in crudo.split(",") if d.strip()]


def _html_equipo(reserva, pago_web) -> str:
    critica = reserva.estado == "revision_sin_cupo"
    categoria = reserva.categoria.nombre if reserva.categoria else "—"
    aviso = (
        "<p style='color:#b00020;font-size:14px'><strong>El pago se acreditó pero ya no "
        "queda unidad para esas fechas.</strong> Hay que ofrecer otra categoría, otras "
        "fechas o devolver la plata.</p>"
        if critica else ""
    )
    saldo = (
        Decimal(str(pago_web.total_reserva))
        - Decimal(str(pago_web.descuento_pago_total))
        - Decimal(str(pago_web.monto))
    )
    cuerpo = f"""
  {aviso}
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 16px 4px 0;color:#666">Contacto</td>
        <td>{reserva.web_contacto_nombre or "—"} — {reserva.web_contacto_telefono or "—"}
            — {reserva.web_contacto_email or "—"}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Categoría</td><td>{categoria}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Retiro</td>
        <td>{reserva.fecha_inicio.strftime('%d/%m/%Y')} {reserva.hora_inicio.strftime('%H:%M')}
            — {reserva.lugar_entrega}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Devolución</td>
        <td>{reserva.fecha_fin.strftime('%d/%m/%Y')} {reserva.hora_fin.strftime('%H:%M')}
            — {reserva.lugar_devolucion}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Cobrado online</td>
        <td>{pesos(pago_web.monto)} ({pago_web.porcentaje_anticipo}%)</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Saldo al retirar</td>
        <td>{pesos(saldo)}</td></tr>
  </table>
  <p style="font-size:13px;color:#666;margin-top:16px">
    Entrá al sistema para asignarle el vehículo y emitir el contrato.
  </p>
"""
    return layout(f"Reserva #{reserva.id} desde la web", cuerpo)


def avisar_al_equipo(db: Session, reserva, pago_web) -> int:
    """
    El aviso interno. Devuelve cuántos envíos salieron bien.

    Si la reserva quedó en `revision_sin_cupo` el asunto lo dice de entrada:
    ese caso hay que resolverlo el mismo día, y un asunto genérico lo
    escondería entre los demás.
    """
    from app.services.email_service import EmailService

    destinos = destinatarios_equipo(db)
    if not destinos:
        logger.info("[Email] sin destinatarios para el aviso de reserva web")
        return 0

    critica = reserva.estado == "revision_sin_cupo"
    asunto = (
        f"Reserva web PAGADA SIN CUPO — resolver hoy (#{reserva.id})"
        if critica
        else f"Reserva nueva desde la web — {reserva.web_contacto_nombre or 'sin nombre'} (#{reserva.id})"
    )
    html = _html_equipo(reserva, pago_web)

    svc = EmailService(db)
    enviados = 0
    for destino in destinos:
        registro = svc.registrar_y_enviar(
            tipo="reserva_web_equipo",
            destinatario=destino,
            asunto=asunto,
            html=html,
            entidad_tipo="reserva",
            entidad_id=reserva.id,
        )
        if registro is not None and registro.estado == "enviado":
            enviados += 1
    return enviados


def confirmar_al_cliente(db: Session, reserva, pago_web) -> bool:
    """El comprobante para quien pagó — la plantilla común de reserva
    confirmada, con el PDF adjunto."""
    from app.services.email_service import EmailService

    registro = EmailService(db).enviar_reserva_confirmada(reserva, pago_web=pago_web)
    return bool(registro is not None and registro.estado == "enviado")


def _html_equipo_transferencia(reserva, anticipo) -> str:
    """
    Igual que `_html_equipo`, pero sin `PagoWeb`: acá no hay pasarela, y el
    monto sale del dataclass `Anticipo` que ya calculó el service. La
    diferencia de fondo con el mail de Mercado Pago es la última línea: acá
    no hay nada acreditado, hay que ir a mirar el extracto.
    """
    categoria = reserva.categoria.nombre if reserva.categoria else "—"
    cuerpo = f"""
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 16px 4px 0;color:#666">Contacto</td>
        <td>{reserva.web_contacto_nombre or "—"} — {reserva.web_contacto_telefono or "—"}
            — {reserva.web_contacto_email or "—"}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Categoría</td><td>{categoria}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Retiro</td>
        <td>{reserva.fecha_inicio.strftime('%d/%m/%Y')} {reserva.hora_inicio.strftime('%H:%M')}
            — {reserva.lugar_entrega}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Devolución</td>
        <td>{reserva.fecha_fin.strftime('%d/%m/%Y')} {reserva.hora_fin.strftime('%H:%M')}
            — {reserva.lugar_devolucion}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">A transferir</td>
        <td>{pesos(anticipo.monto_a_cobrar)} ({anticipo.porcentaje}%)</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Saldo al retirar</td>
        <td>{pesos(anticipo.saldo)}</td></tr>
  </table>
  <p style="font-size:13px;color:#666;margin-top:16px">
    <strong>Todavía no hay plata acreditada.</strong> El cliente va a mandar el
    comprobante por WhatsApp — cuando lo veas en el extracto, registrá el cobro
    desde la reserva para confirmarla. No se confirma sola: por transferencia
    no hay aviso automático.
  </p>
"""
    return layout(f"Reserva #{reserva.id} — esperando transferencia", cuerpo)


def avisar_al_equipo_transferencia(db: Session, reserva, anticipo) -> int:
    """El aviso interno del camino de transferencia. Devuelve cuántos envíos
    salieron bien."""
    from app.services.email_service import EmailService

    destinos = destinatarios_equipo(db)
    if not destinos:
        logger.info("[Email] sin destinatarios para el aviso de reserva por transferencia")
        return 0

    asunto = f"Reserva por transferencia — {reserva.web_contacto_nombre or 'sin nombre'} (#{reserva.id})"
    html = _html_equipo_transferencia(reserva, anticipo)

    svc = EmailService(db)
    enviados = 0
    for destino in destinos:
        registro = svc.registrar_y_enviar(
            tipo="reserva_web_transferencia_equipo",
            destinatario=destino,
            asunto=asunto,
            html=html,
            entidad_tipo="reserva",
            entidad_id=reserva.id,
        )
        if registro is not None and registro.estado == "enviado":
            enviados += 1
    return enviados


def notificar_reserva_transferencia_pendiente(db: Session, reserva, anticipo) -> dict:
    """
    El aviso equivalente a `notificar_reserva_pagada`, para el único camino
    de cobro que hoy funciona de verdad (C-4, plan de conexión 13/08).

    No hay comprobante que mandarle al cliente todavía —no pagó, dejó una
    reserva pendiente—: el CBU y el WhatsApp para el comprobante ya se los
    dio la respuesta del endpoint. Este mail es sólo para el equipo.

    **Nunca levanta.** Igual que el de Mercado Pago: la reserva ya está
    creada y un mail que falla no puede tumbarla.
    """
    resultado = {"equipo": 0}
    try:
        resultado["equipo"] = avisar_al_equipo_transferencia(db, reserva, anticipo)
    except Exception:
        logger.exception(
            "[Email] falló el aviso al equipo de la reserva por transferencia #%s", reserva.id
        )
    return resultado


def avisar_al_equipo_solicitud_sin_cupo(db: Session, reserva) -> int:
    """
    Plan de conexión (13/08), punto 1.4: `crear_solicitud_sin_cupo` avisaba
    por campana pero no por mail. Es una venta a recuperar —alguien pidió una
    categoría agotada y dejó sus datos igual—, y hasta ahora dependía de que
    alguien tuviera la campana abierta en el momento exacto.
    """
    from app.services.email_service import EmailService

    destinos = destinatarios_equipo(db)
    if not destinos:
        logger.info("[Email] sin destinatarios para la solicitud sin cupo #%s", reserva.id)
        return 0

    categoria = reserva.categoria.nombre if reserva.categoria else "—"
    cuerpo = f"""
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 16px 4px 0;color:#666">Contacto</td>
        <td>{reserva.web_contacto_nombre or "—"} — {reserva.web_contacto_telefono or "—"}
            — {reserva.web_contacto_email or "—"}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Categoría pedida</td><td>{categoria}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Fechas</td>
        <td>{reserva.fecha_inicio.strftime('%d/%m/%Y')} al {reserva.fecha_fin.strftime('%d/%m/%Y')}</td></tr>
  </table>
  <p style="font-size:13px;color:#666;margin-top:16px">
    No hay cupo de esa categoría para esas fechas. Ofrecele otra categoría,
    otras fechas, o avisale cuando se libere — desde la bandeja de reservas
    web.
  </p>
"""
    html = layout(f"Solicitud sin cupo #{reserva.id}", cuerpo)
    asunto = f"Sin disponibilidad — {reserva.web_contacto_nombre or 'sin nombre'} (#{reserva.id})"

    svc = EmailService(db)
    enviados = 0
    for destino in destinos:
        registro = svc.registrar_y_enviar(
            tipo="reserva_web_sin_cupo_equipo",
            destinatario=destino,
            asunto=asunto,
            html=html,
            entidad_tipo="reserva",
            entidad_id=reserva.id,
        )
        if registro is not None and registro.estado == "enviado":
            enviados += 1
    return enviados


MOTIVO_SOLICITUD_TEXTO = {
    "fuera_de_ventana": "Las fechas que pidió están dentro de los días que la "
                        "web no cierra sola — hay que confirmarle disponibilidad.",
    "sin_cupo": "La categoría que pidió no tenía cupo en el sistema. Puede "
                "ofrecerse una equivalente o un upgrade.",
    "otro_lugar": "Pidió un punto de entrega fuera de los habituales. Hay que "
                  "coordinarlo y ver si lleva costo extra.",
}


def avisar_al_equipo_solicitud_contacto(db: Session, solicitud) -> int:
    """
    Alguien dejó sus datos para que lo llamemos (D-61).

    **Le prometimos una llamada**, así que el aviso no puede depender de que
    alguien tenga la campana abierta en el momento justo.

    A diferencia de los otros mails de este archivo, acá **se escapa el texto
    que escribió la persona** antes de meterlo en el HTML: nombre, teléfono y
    sobre todo `lugar_texto_libre` son campos abiertos de un endpoint público
    sin autenticación. Los mails viejos interpolan directo (ver
    `avisar_al_equipo_solicitud_sin_cupo`) y conviene no copiar ese patrón.
    """
    import html as _html

    from app.services.email_service import EmailService

    destinos = destinatarios_equipo(db)
    if not destinos:
        logger.info("[Email] sin destinatarios para la solicitud de contacto #%s", solicitud.id)
        return 0

    def esc(valor) -> str:
        return _html.escape(str(valor)) if valor else "—"

    categoria = esc(solicitud.categoria.nombre if solicitud.categoria else None)
    if solicitud.fecha_inicio:
        fechas = solicitud.fecha_inicio.strftime("%d/%m/%Y")
        if solicitud.fecha_fin:
            fechas += f" al {solicitud.fecha_fin.strftime('%d/%m/%Y')}"
    else:
        fechas = "no las eligió todavía"

    lugar = esc(solicitud.lugar_texto_libre or solicitud.lugar_retiro)
    porque = MOTIVO_SOLICITUD_TEXTO.get(solicitud.motivo, "")

    cuerpo = f"""
  <p style="font-size:14px;margin:0 0 12px">
    <strong>Pidió que lo llamemos.</strong> Todavía no reservó nada.
  </p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 16px 4px 0;color:#666">Nombre</td><td>{esc(solicitud.nombre)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Teléfono</td><td>{esc(solicitud.telefono)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Email</td><td>{esc(solicitud.email)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Categoría</td><td>{categoria}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Fechas</td><td>{esc(fechas)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#666">Lugar</td><td>{lugar}</td></tr>
  </table>
  <p style="font-size:13px;color:#666;margin-top:16px">{_html.escape(porque)}</p>
"""
    html_mail = layout(f"Piden que los llamemos #{solicitud.id}", cuerpo)
    asunto = f"Piden que los llamemos — {solicitud.nombre} (#{solicitud.id})"

    svc = EmailService(db)
    enviados = 0
    for destino in destinos:
        registro = svc.registrar_y_enviar(
            tipo="solicitud_contacto_equipo",
            destinatario=destino,
            asunto=asunto,
            html=html_mail,
            entidad_tipo="solicitud_contacto",
            entidad_id=solicitud.id,
        )
        if registro is not None and registro.estado == "enviado":
            enviados += 1
    return enviados


def notificar_reserva_pagada(db: Session, reserva, pago_web) -> dict:
    """
    Los dos envíos juntos, tolerante a fallas.

    **Nunca levanta.** Se llama desde el webhook de Mercado Pago, y que falle
    un mail no puede tumbar la acreditación de un pago que ya entró.
    """
    resultado = {"equipo": 0, "cliente": False}
    try:
        resultado["equipo"] = avisar_al_equipo(db, reserva, pago_web)
    except Exception:
        logger.exception("[Email] falló el aviso al equipo de la reserva #%s", reserva.id)
    try:
        resultado["cliente"] = confirmar_al_cliente(db, reserva, pago_web)
    except Exception:
        logger.exception("[Email] falló la confirmación al cliente de la reserva #%s", reserva.id)
    return resultado
