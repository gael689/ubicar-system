from datetime import date, datetime

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Prospecto(Base):
    """
    Una empresa que podría alquilar autos a Ubicar.

    **Llegan ya curadas** desde el buscador de leads de Gael (corre en su
    máquina y empuja acá sólo lo que se decide publicar): no se importa "todo",
    se importa lo que sirve. `ref_externa` es el identificador que tiene del
    otro lado (el `place_id` de Google), para que importar dos veces actualice
    en lugar de duplicar.

    Los datos de contacto son de **empresas**, no de personas: el alcance es
    constructoras, turismo, logística, agencias, etc. Un prospecto con
    `no_contactar` no vuelve a entrar a ninguna campaña.
    """
    __tablename__ = "prospectos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    ref_externa: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)

    nombre: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    segmento: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    ciudad: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    direccion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    instagram: Mapped[str | None] = mapped_column(String(120), nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # nuevo | contactado | respondio | cliente | descartado | no_contactar
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="nuevo", server_default="nuevo", index=True)

    # ── El cruce con los clientes de Ubicar ─────────────────────────────────
    ya_cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    # Por qué se cree que es el mismo: email | telefono | dominio | nombre.
    # Un cruce por nombre es flojo y puede descartarse a mano.
    cruce_por: Mapped[str | None] = mapped_column(String(12), nullable=True)
    cruce_descartado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Quien pidió que no lo contacten (viene marcado desde el buscador de Gael).
    no_contactar: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false", index=True)
    no_contactar_motivo: Mapped[str | None] = mapped_column(String(120), nullable=True)

    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    ya_cliente = relationship("Cliente", foreign_keys=[ya_cliente_id])

    @property
    def es_cliente(self) -> bool:
        """Ya es cliente: cruce firme, o cruce por nombre que nadie descartó."""
        return self.ya_cliente_id is not None and not self.cruce_descartado


class CampanaProspecto(Base):
    """
    Una campaña a un grupo de prospectos.

    **Se arma, se revisa y recién después sale.** Nace en `borrador` con sus
    destinatarios ya evaluados (a quién se le puede escribir y a quién no, con el
    motivo). El mensaje (`asunto`/`cuerpo`) puede estar vacío: lo escribe una
    persona después. Sin mensaje y sin un remitente verificado no se prepara.
    """
    __tablename__ = "campanas_prospecto"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    canal: Mapped[str] = mapped_column(String(10), nullable=False, default="email", server_default="email")
    # borrador | lista | enviando | pausada | terminada | cancelada
    estado: Mapped[str] = mapped_column(String(15), nullable=False, default="borrador", server_default="borrador", index=True)
    # Con qué filtro se armó (para saber de dónde salió la selección).
    filtro: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    asunto: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cuerpo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Los toques de seguimiento, ya redactados: `[{"dias": 5, "cuerpo": "…"}, …]`
    # (días desde el primer mail). Vacío = la campaña es de un solo mail.
    seguimientos: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Quién firma (`{{firma_nombre}}` / `{{firma_telefono}}`).
    firma_nombre: Mapped[str | None] = mapped_column(String(80), nullable=True)
    firma_telefono: Mapped[str | None] = mapped_column(String(40), nullable=True)
    creada_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    lanzada_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    destinatarios = relationship(
        "CampanaDestinatario", back_populates="campana", cascade="all, delete-orphan"
    )


class CampanaDestinatario(Base):
    __tablename__ = "campana_destinatarios"
    __table_args__ = (UniqueConstraint("campana_id", "prospecto_id", name="uq_campana_prospecto"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    campana_id: Mapped[int] = mapped_column(ForeignKey("campanas_prospecto.id", ondelete="CASCADE"), nullable=False, index=True)
    prospecto_id: Mapped[int] = mapped_column(ForeignKey("prospectos.id"), nullable=False, index=True)
    # pendiente | enviado | omitido | error
    estado: Mapped[str] = mapped_column(String(12), nullable=False, default="pendiente", server_default="pendiente")
    motivo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    enviado_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    campana = relationship("CampanaProspecto", back_populates="destinatarios")
    prospecto = relationship("Prospecto")


class CasillaProspeccion(Base):
    """
    Una casilla desde la que salen las campañas (`franco@empresas.ubicar-rent.com.ar`).

    **Siempre en un subdominio**, nunca en la raíz: de la raíz salen las
    confirmaciones de reserva y los contratos, y un mail en frío marcado como
    spam le pega a la reputación del dominio entero (ver
    `domain/prospeccion_envio.analizar_direccion`).

    `estado`:
    - `activa`: manda.
    - `pausada`: la frenó una persona o el freno automático (`motivo_estado`
      dice cuál). Vuelve con "Reactivar", que reinicia `salud_desde`.
    - `inactiva`: su dominio todavía no está verificado en Resend.
    """
    __tablename__ = "casillas_prospeccion"

    id: Mapped[int] = mapped_column(primary_key=True)
    direccion: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    nombre_visible: Mapped[str] = mapped_column(String(120), nullable=False)
    # Adónde llegan las respuestas. Vacío = a la misma casilla.
    responder_a: Mapped[str | None] = mapped_column(String(255), nullable=True)
    limite_dia: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    # Desde cuándo corre la rampa (15/día la primera semana, 25 la segunda).
    rampa_desde: Mapped[date | None] = mapped_column(Date, nullable=True)
    estado: Mapped[str] = mapped_column(String(12), nullable=False, default="inactiva", server_default="inactiva", index=True)
    motivo_estado: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # El freno automático sólo mira los envíos posteriores a esta fecha: al
    # reactivar una casilla, los rebotes viejos no la vuelven a pausar.
    salud_desde: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    # No antes de esta hora sale el próximo mail de esta casilla (el espaciado
    # aleatorio entre envíos; ver `ESPACIADO_MIN_S`).
    proximo_envio_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @property
    def dominio(self) -> str:
        return self.direccion.rsplit("@", 1)[-1]


class CampanaEnvio(Base):
    """
    Un mail de una campaña a un prospecto: **un toque**.

    `asunto` y `cuerpo` se guardan ya renderizados: queda la constancia exacta
    de qué se le mandó a cada empresa, aunque después se edite la plantilla.

    `estado`: `en_cola` → `enviando` (lo tomó el motor; es el estado intermedio
    que impide que dos corridas manden lo mismo) → `enviado` → `entregado` |
    `rebotado` | `queja` | `respondio` | `baja`. Los que no salen: `omitido`
    (dejó de ser contactable), `cancelado` (campaña cancelada, o el prospecto
    respondió antes), `error`.

    Las fechas (`enviado_at`, `entregado_at`, …) son las que cuentan para los
    números de la campaña: el estado es sólo "lo último que pasó".
    """
    __tablename__ = "campana_envios"
    __table_args__ = (
        UniqueConstraint("campana_id", "prospecto_id", "toque", name="uq_campana_envio_toque"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    campana_id: Mapped[int] = mapped_column(ForeignKey("campanas_prospecto.id", ondelete="CASCADE"), nullable=False, index=True)
    prospecto_id: Mapped[int] = mapped_column(ForeignKey("prospectos.id"), nullable=False, index=True)
    toque: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    casilla_id: Mapped[int | None] = mapped_column(ForeignKey("casillas_prospeccion.id", ondelete="SET NULL"), nullable=True, index=True)
    # La dirección queda copiada: si la casilla se borra, se sigue sabiendo de dónde salió.
    desde: Mapped[str | None] = mapped_column(String(255), nullable=True)
    para: Mapped[str] = mapped_column(String(255), nullable=False)
    asunto: Mapped[str] = mapped_column(String(200), nullable=False)
    cuerpo: Mapped[str] = mapped_column(Text, nullable=False)
    programado_para: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    estado: Mapped[str] = mapped_column(String(12), nullable=False, default="en_cola", server_default="en_cola", index=True)
    motivo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    proveedor_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    # No salió de verdad: entorno de prueba, sin API key, o fuera de la lista blanca.
    simulado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    intentos: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    tomado_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    enviado_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    entregado_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rebotado_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rebote_duro: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    queja_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    respondio_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    campana = relationship("CampanaProspecto")
    prospecto = relationship("Prospecto")
    casilla = relationship("CasillaProspeccion")
