from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Boolean, ForeignKey, JSON, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ContratoPlantilla(Base):
    """
    El clausulado del contrato, **versionado**.

    Vive en la base y no en el código porque un contrato firmado tiene que
    poder reimprimirse exactamente como se firmó. Si el texto estuviera en el
    generador de PDF, corregir una coma reescribiría el pasado: los contratos
    ya firmados se re-renderizarían con el texto nuevo.

    Editar nunca pisa una versión: se crea una nueva y la anterior queda
    vigente para los contratos que la usaron.

    `clausulas` es JSON estructurado y no HTML:
    `[{numero, titulo, parrafos: [{texto, subrayados: [[ini, fin]]}]}]`.
    Los subrayados son parte del documento legal —marcan los pasajes de
    exención de responsabilidad y penalidades— y el generador necesita saber
    dónde van. Guardar markup invitaría a pegar HTML roto en un contrato.
    """
    __tablename__ = "contrato_plantillas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    clausulas: Mapped[list] = mapped_column(JSON, nullable=False)
    vigente_desde: Mapped[date] = mapped_column(Date(), nullable=False)
    # Sólo una activa a la vez: es la que se aplica a los contratos nuevos.
    activa: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)


class Contrato(Base):
    """
    Un contrato de alquiler emitido.

    **`snapshot` es la pieza central**: congela todo el anverso ya resuelto
    (cliente, conductor, vehículo, fechas, km, desglose de cargos, coberturas,
    franquicia, totales y operador). Renderizar contra las tablas vivas
    produciría, dos años después, un PDF distinto del que el cliente firmó —
    que es exactamente lo que un contrato no puede hacer.

    Es además lo que hace posible que los datos sean editables antes de
    generar: se guarda lo corregido, no lo que decía el sistema.
    """
    __tablename__ = "contratos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    numero: Mapped[int | None] = mapped_column(
        Integer, nullable=True, server_default=text("nextval('contratos_numero_seq')")
    )
    prefijo: Mapped[str] = mapped_column(String(5), nullable=False, default="C")

    alquiler_id: Mapped[int] = mapped_column(
        ForeignKey("alquileres.id"), nullable=False, index=True
    )
    # Con qué versión del clausulado se firmó. Es lo que hace reimprimible un
    # contrato viejo.
    plantilla_id: Mapped[int | None] = mapped_column(
        ForeignKey("contrato_plantillas.id"), nullable=True
    )
    snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # ── Firma ológrafa digitalizada (no firma digital con certificado) ──────
    firmado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    firmado_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    firma_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Quién firmó: puede no ser el titular de la reserva.
    firmado_por_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)
    firmado_por_dni: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # El "Usted fue atendido por" del pie.
    atendido_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    url_pdf: Mapped[str | None] = mapped_column(String(512), nullable=True)

    anulado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    fecha_generacion: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    # Campos del diseño original que quedan sin uso por ahora: el contrato se
    # firma en el mostrador, no por un link que se le manda al cliente.
    datos_prellenados: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    link_prellenado: Mapped[str | None] = mapped_column(String(512), nullable=True)
    link_expiracion: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    alquiler: Mapped["Alquiler"] = relationship("Alquiler", back_populates="contrato")

    @property
    def numero_formateado(self) -> str:
        return f"{self.prefijo}-{self.numero:08d}" if self.numero else "—"
