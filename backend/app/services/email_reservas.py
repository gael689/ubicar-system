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
