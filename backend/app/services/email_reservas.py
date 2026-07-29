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
- **El cliente** necesita el comprobante de lo que pagó y de lo que falta
  pagar, más dónde y cuándo retira.

Igual que el digest, si no hay `resend_api_key` esto es un no-op silencioso:
`enviar_email` loguea y devuelve False. El aviso en la campana del sistema no
depende de esto y sigue funcionando.
"""
import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.services.notificaciones import enviar_email

logger = logging.getLogger(__name__)

# D-32b. Vive en `configuracion` y no en una variable de entorno para que los
# dueños puedan cambiar la casilla sin un deploy — que es exactamente lo que
# arregló la migración 048 para `web.hold_minutos`.
CLAVE_DESTINATARIOS = "web.emails_aviso_reserva"


def _pesos(monto: Decimal | float | None) -> str:
    if monto is None:
        return "$0"
    return f"${Decimal(str(monto)):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


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


def _bloque_datos(reserva) -> str:
    categoria = reserva.categoria.nombre if reserva.categoria else "—"
    return f"""
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
        <tr><td><strong>Categoría</strong></td><td>{categoria}</td></tr>
        <tr><td><strong>Retiro</strong></td>
            <td>{reserva.fecha_inicio.strftime('%d/%m/%Y')} {reserva.hora_inicio.strftime('%H:%M')}
                — {reserva.lugar_entrega}</td></tr>
        <tr><td><strong>Devolución</strong></td>
            <td>{reserva.fecha_fin.strftime('%d/%m/%Y')} {reserva.hora_fin.strftime('%H:%M')}
                — {reserva.lugar_devolucion}</td></tr>
      </table>
    """


def avisar_al_equipo(db: Session, reserva, pago_web) -> int:
    """
    El aviso interno. Devuelve cuántos envíos salieron bien.

    Si la reserva quedó en `revision_sin_cupo` el asunto lo dice de entrada:
    ese caso hay que resolverlo el mismo día, y un asunto genérico lo
    escondería entre los demás.
    """
    destinos = destinatarios_equipo(db)
    if not destinos:
        logger.info("[Email] sin destinatarios para el aviso de reserva web")
        return 0

    critica = reserva.estado == "revision_sin_cupo"
    contacto = reserva.web_contacto_nombre or "—"
    telefono = reserva.web_contacto_telefono or "—"
    email_cliente = reserva.web_contacto_email or "—"

    asunto = (
        f"🔴 Reserva web PAGADA SIN CUPO — resolver hoy (#{reserva.id})"
        if critica
        else f"Reserva nueva desde la web — {contacto} (#{reserva.id})"
    )

    aviso = (
        "<p style='color:#b00020'><strong>El pago se acreditó pero ya no queda "
        "unidad para esas fechas.</strong> Hay que ofrecer otra categoría, otras "
        "fechas o devolver la plata.</p>"
        if critica else ""
    )

    html = f"""
      <h2>Reserva #{reserva.id} — {contacto}</h2>
      {aviso}
      {_bloque_datos(reserva)}
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
        <tr><td><strong>Contacto</strong></td><td>{telefono} — {email_cliente}</td></tr>
        <tr><td><strong>Cobrado online</strong></td>
            <td>{_pesos(pago_web.monto)} ({pago_web.porcentaje_anticipo}%)</td></tr>
        <tr><td><strong>Saldo al retirar</strong></td>
            <td>{_pesos(Decimal(str(pago_web.total_reserva))
                        - Decimal(str(pago_web.descuento_pago_total))
                        - Decimal(str(pago_web.monto)))}</td></tr>
      </table>
      <p style="font-size:13px;color:#555">
        Entrá al sistema para asignarle el vehículo y emitir el contrato.
      </p>
    """
    return sum(1 for d in destinos if enviar_email(d, asunto, html))


def confirmar_al_cliente(reserva, pago_web) -> bool:
    """
    El comprobante para quien pagó.

    **No se manda si la reserva quedó sin cupo.** Decirle "tu reserva está
    confirmada" a alguien a quien todavía no le podemos dar un auto es peor que
    no escribirle: cuando lo llamen a explicarle, ya va a tener un mail que
    dice lo contrario.
    """
    destino = reserva.web_contacto_email
    if not destino:
        return False
    if reserva.estado != "confirmada":
        logger.info(
            "[Email] reserva #%s en estado '%s': no se manda confirmación al cliente",
            reserva.id, reserva.estado,
        )
        return False

    saldo = (
        Decimal(str(pago_web.total_reserva))
        - Decimal(str(pago_web.descuento_pago_total))
        - Decimal(str(pago_web.monto))
    )
    resto = (
        f"<p>Al retirar el vehículo abonás el saldo de <strong>{_pesos(saldo)}</strong>.</p>"
        if saldo > 0
        else "<p>Tu alquiler está <strong>pagado en su totalidad</strong>.</p>"
    )

    html = f"""
      <h2>¡Listo! Tu reserva está confirmada</h2>
      <p>Hola {reserva.web_contacto_nombre or ''}, recibimos tu pago
         de <strong>{_pesos(pago_web.monto)}</strong>.</p>
      {_bloque_datos(reserva)}
      {resto}
      <p style="font-size:13px;color:#555">
        Acordate de llevar tu <strong>DNI y licencia de conducir vigente</strong>.
        Número de reserva: <strong>#{reserva.id}</strong>.
      </p>
      <p style="font-size:13px;color:#555">Ubicar Rent — Bahía Blanca</p>
    """
    return enviar_email(destino, f"Reserva confirmada #{reserva.id} — Ubicar Rent", html)


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
        resultado["cliente"] = confirmar_al_cliente(reserva, pago_web)
    except Exception:
        logger.exception("[Email] falló la confirmación al cliente de la reserva #%s", reserva.id)
    return resultado
