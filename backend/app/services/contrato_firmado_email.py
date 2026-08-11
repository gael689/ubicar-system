from __future__ import annotations
"""
El mail que sale cuando el cliente firma el contrato desde el link (D-C6).

**Por qué el PDF va adjunto y no como link.** Las tres formas de entregarle al
cliente el contrato que acaba de firmar se evaluaron así:

- *Descarga automática al firmar*: los navegadores de teléfono bloquean la
  descarga que no sale de un gesto, y cuando funciona el archivo cae en una
  carpeta que mucha gente no encuentra. Queda como **botón** en la pantalla de
  confirmación, no como descarga automática.
- *Link al PDF*: barato y sirve, pero vive lo que vive el token. Es el respaldo
  para el que vuelve a abrir el WhatsApp, no la entrega.
- *Mail con el PDF adjunto*: es el único que **deja constancia de la entrega** y
  el único que el cliente conserva sin hacer nada. Es el principal.

Los tres conviven porque resuelven cosas distintas, y ninguno depende de que
los otros funcionen.

⚠️ **Depende de que Resend tenga el dominio verificado.** Hoy el sistema sólo
puede escribirle a la casilla de Ubicar; a un cliente real no le llega. Hasta
que eso se resuelva, la copia del cliente es el botón de la pantalla y el link
—que sí funcionan— y el equipo recibe el aviso igual. `enviar_email` es un
no-op silencioso, así que nada de esto falla ruidosamente mientras tanto.
"""
import logging

from sqlalchemy.orm import Session

from app.services.email_reservas import destinatarios_equipo
from app.services.notificaciones import enviar_email

logger = logging.getLogger(__name__)


def _email_del_cliente(contrato) -> str | None:
    """
    El mail al que mandarle la copia.

    Sale del snapshot congelado antes que de la ficha del cliente: el snapshot
    es lo que se le mostró al firmar, y si alguien le corrigió el mail en el
    sistema mientras tanto, la copia tiene que ir igual a donde el contrato
    decía.
    """
    snap = contrato.snapshot or {}
    del_snapshot = (snap.get("cliente") or {}).get("email")
    if del_snapshot:
        return del_snapshot
    reserva = contrato.reserva
    if reserva is not None:
        return getattr(reserva, "web_contacto_email", None) or getattr(
            getattr(reserva, "cliente", None), "email", None
        )
    return None


def _html_cliente(contrato, empresa: dict) -> str:
    marca = empresa.get("nombre_comercial") or "Ubicar Rent"
    legal = empresa.get("razon_social") or ""
    return f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;color:#111">
      <h2 style="margin:0 0 4px">Listo, quedó firmado</h2>
      <p style="margin:0 0 16px;color:#555">
        Contrato <strong>{contrato.numero_formateado}</strong>
      </p>
      <p>Te adjuntamos el contrato firmado en PDF. Guardalo: es el mismo
      documento que aceptaste, con tu firma.</p>
      <p style="color:#555;font-size:13px">
        Cualquier cambio de fecha o de lugar de devolución, avisanos antes:
        puede generar cargos adicionales.
      </p>
      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
      <p style="color:#777;font-size:12px;margin:0">
        {marca}{f" — {legal}" if legal else ""}<br>
        {empresa.get("telefonos") or ""} · {empresa.get("email") or ""}
      </p>
    </div>
    """


def _html_equipo(contrato) -> str:
    reserva = contrato.reserva
    aceptaciones = contrato.firma_aceptaciones or []
    firmado = contrato.firmado_at.strftime("%d/%m/%Y %H:%M") if contrato.firmado_at else "—"
    return f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;color:#111">
      <h2 style="margin:0 0 12px">Contrato firmado desde el link</h2>
      <table style="font-size:14px;border-collapse:collapse">
        <tr><td style="padding:2px 12px 2px 0;color:#555">Contrato</td>
            <td><strong>{contrato.numero_formateado}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#555">Reserva</td>
            <td>{f"#{reserva.id}" if reserva else "—"}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#555">Firmó</td>
            <td>{contrato.firmado_por_nombre or "—"} — DNI {contrato.firmado_por_dni or "—"}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#555">Cuándo</td>
            <td>{firmado} (UTC)</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#555">Desde</td>
            <td>{contrato.firma_ip or "—"}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#555">Aceptó</td>
            <td>{len(aceptaciones)} declaraciones</td></tr>
      </table>
      <p style="color:#555;font-size:13px;margin-top:16px">
        El PDF va adjunto. El detalle de qué aceptó, con el texto completo,
        queda guardado en el contrato.
      </p>
    </div>
    """


def notificar_contrato_firmado(db: Session, contrato) -> None:
    """
    Manda las dos copias. **Nunca levanta**: el cliente ya firmó y la firma ya
    está guardada; que falle un mail no puede devolverle un error que lo deje
    pensando que no quedó.
    """
    try:
        from app.services.contrato_service import ContratoService

        svc = ContratoService(db)
        pdf = svc.generar_pdf(contrato.id)
        adjunto = [(f"contrato_{contrato.numero_formateado}.pdf", pdf)]
        empresa = (contrato.snapshot or {}).get("empresa") or svc.datos_empresa()

        for destino in destinatarios_equipo(db):
            enviar_email(
                destino,
                f"Contrato firmado — {contrato.numero_formateado}",
                _html_equipo(contrato),
                adjuntos=adjunto,
            )

        email_cliente = _email_del_cliente(contrato)
        if email_cliente:
            enviar_email(
                email_cliente,
                f"Tu contrato firmado — {contrato.numero_formateado}",
                _html_cliente(contrato, empresa),
                adjuntos=adjunto,
            )
        else:
            logger.info(
                "[Contratos] %s firmado sin email de cliente: no se manda copia",
                contrato.numero_formateado,
            )
    except Exception:
        logger.exception(
            "[Contratos] falló el aviso de firma de %s", getattr(contrato, "id", "?")
        )
