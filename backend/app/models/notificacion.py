from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Text, Boolean, Integer, ForeignKey, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Notificacion(Base):
    """
    Alerta persistida generada por el motor de reglas (ver
    domain/notificaciones_reglas.py). Reemplaza el cómputo on-demand que
    tenía el router antes de la Fase 2: ahora se puede marcar leída,
    posponer, descartar, y queda historial de todo lo que se avisó.

    `clave_dedupe` (`{tipo}:{entidad_tipo}:{entidad_id}:{fecha_objetivo}`) es
    UNIQUE — es lo que evita que el motor, corriendo todos los días, vuelva a
    crear la misma alerta. La auto-resolución (NotificacionService.
    auto_resolver) usa `(tipo, entidad_tipo, entidad_id)` sin la fecha: si la
    condición que la generó ya no aparece en ninguna corrida de esa regla,
    la notificación pasa a `resuelta` sola.
    """
    __tablename__ = "notificaciones"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    urgencia: Mapped[str] = mapped_column(
        Enum("critica", "alta", "media", "baja", name="urgencia_notificacion"), nullable=False
    )
    entidad_tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    entidad_id: Mapped[int] = mapped_column(Integer, nullable=False)
    url_destino: Mapped[str] = mapped_column(String(255), nullable=False)

    # La fecha del hecho real (vencimiento, cobro, devolución). Puede ser
    # None para alertas sin fecha propia (ej: límite de crédito superado).
    fecha_objetivo: Mapped[date | None] = mapped_column(Date(), nullable=True)
    programada_para: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    estado: Mapped[str] = mapped_column(
        Enum("pendiente", "enviada", "leida", "pospuesta", "descartada", "resuelta", name="estado_notificacion"),
        nullable=False,
        default="pendiente",
    )
    # nullable = para todos los usuarios (hoy, sin Clerk, es el caso normal).
    destinatario_usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    canales_enviados: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    clave_dedupe: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    posponer_hasta: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    leida_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resuelta_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resuelta_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PreferenciaNotificacion(Base):
    """
    Por usuario + tipo de regla: qué canales usar y con cuántos días de
    anticipación (T-N). Sin fila = usa el default de la regla. Existe para
    que, por ejemplo, Franco pueda pedir los echeqs a T-5 y Martín a T-2 sin
    que eso apague la alerta para el otro.
    """
    __tablename__ = "preferencias_notificacion"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    tipo_regla: Mapped[str] = mapped_column(String(60), nullable=False)
    canales: Mapped[list] = mapped_column(JSON, nullable=False, default=lambda: ["in_app"])
    anticipacion_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
