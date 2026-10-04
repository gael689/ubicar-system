from datetime import datetime

from sqlalchemy import (
    JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
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

    # Si alguien ya le escribió antes (el buscador de Gael lo sabe).
    contacto_previo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    contacto_previo_detalle: Mapped[str | None] = mapped_column(String(255), nullable=True)
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
    incluir_contacto_previo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    asunto: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cuerpo: Mapped[str | None] = mapped_column(Text, nullable=True)
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
