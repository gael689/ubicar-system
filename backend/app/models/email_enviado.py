from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EmailEnviado(Base):
    """
    El registro de cada mail que el sistema intentó mandar.

    **Existe para poder contestar "¿le llegó?".** Antes los envíos se hacían y
    se olvidaban: `enviar_email` devolvía True/False, alguien lo logueaba y ahí
    moría. Cuando el cliente llamaba diciendo que no recibió la confirmación,
    no había forma de saber si se había mandado, a qué casilla, ni por qué
    falló — sólo revisar los logs del servidor, que nadie del mostrador puede
    hacer.

    Se guarda **el intento**, no el éxito: una fila `fallido` con el error de
    Resend vale tanto como una `enviado`. El estado `omitido` es el tercero y
    el menos obvio: el mail no se intentó a propósito (hoy, porque el
    remitente es el de prueba de Resend y a un cliente real no le llegaría).
    Registrarlo como omitido y no como fallido es la diferencia entre "el
    sistema está roto" y "todavía falta verificar el dominio".

    `cuerpo_html` se guarda para poder mostrar en el panel exactamente qué se
    mandó, y para poder reintentar un envío sin volver a armarlo. Los adjuntos
    no se guardan (pesan y se regeneran solos): `con_adjunto` deja constancia
    de que iban, y el reintento los vuelve a generar desde la entidad.
    """

    __tablename__ = "emails_enviados"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Qué mail es. Los valores viven en `services/email_service.py` (TIPOS).
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    destinatario: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    remitente: Mapped[str] = mapped_column(String(255), nullable=False)
    asunto: Mapped[str] = mapped_column(String(255), nullable=False)
    cuerpo_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    # A qué se refiere, para poder abrirlo desde el panel y para reintentar.
    entidad_tipo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Sin índice propio: el panel entra siempre por el par (ver el índice
    # compuesto `ix_emails_enviados_entidad` de la migración 060).
    entidad_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    estado: Mapped[str] = mapped_column(
        Enum("enviado", "fallido", "omitido", name="estado_email"),
        nullable=False,
        default="enviado",
        index=True,
    )
    # El error de Resend, o el motivo por el que no se intentó.
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # El id que devuelve Resend: es lo que hay que pegarle a soporte.
    proveedor_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    con_adjunto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Automático (el flujo lo disparó) o a mano desde el sistema.
    automatico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    intentos: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    enviado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ultimo_intento_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
