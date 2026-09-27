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

⚠️ **Depende de que Resend tenga el dominio verificado.** Hoy el remitente es
el de prueba de Resend, así que la copia del cliente **no se manda**: queda
registrada como `omitido` en el panel de mails, con el motivo escrito, y el
cliente se queda con el botón de la pantalla y el link —que sí funcionan—.
Cuando el dominio esté verificado, alcanza con cambiar `FROM_EMAIL` y
reintentar desde el panel.

**Al equipo ya no se le manda copia** (27/09/2026: las notificaciones internas
van sólo a la plataforma). La firma queda en el historial de la campana.
"""
import logging

from sqlalchemy.orm import Session

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



def notificar_contrato_firmado(db: Session, contrato) -> None:
    """
    Manda la copia al cliente. **Nunca levanta**: el cliente ya firmó y la
    firma ya está guardada; que falle un mail no puede devolverle un error que
    lo deje pensando que no quedó.
    """
    try:
        email_cliente = _email_del_cliente(contrato)
        if not email_cliente:
            # Sin destinatario no hay nada que armar: generar los PDFs para
            # tirarlos sería trabajo de más en el momento de la firma.
            logger.info(
                "[Contratos] %s firmado sin email de cliente: no se manda copia",
                contrato.numero_formateado,
            )
            return

        from app.services.contrato_service import ContratoService
        from app.services.email_service import EmailService

        svc = ContratoService(db)
        pdf = svc.generar_pdf(contrato.id)
        adjunto = [(f"contrato_{contrato.numero_formateado}.pdf", pdf)]

        # El pagaré firmado va en el mismo mail: se firmó en el mismo acto, y
        # la copia del cliente tiene que tener los dos documentos que firmó.
        from app.services.pagare_service import PagareService

        pagares = PagareService(db)
        pagare = pagares.de_contrato(contrato.id)
        if pagare is not None and pagare.firmado:
            adjunto.append(
                (f"pagare_{pagare.numero_formateado}.pdf", pagares.generar_pdf(pagare.id))
            )
        empresa = (contrato.snapshot or {}).get("empresa") or svc.datos_empresa()

        EmailService(db).registrar_y_enviar(
            tipo="contrato_firmado",
            destinatario=email_cliente,
            asunto=f"Tu contrato firmado — {contrato.numero_formateado}",
            html=_html_cliente(contrato, empresa),
            entidad_tipo="contrato",
            entidad_id=contrato.id,
            adjuntos=adjunto,
        )
    except Exception:
        logger.exception(
            "[Contratos] falló el aviso de firma de %s", getattr(contrato, "id", "?")
        )
