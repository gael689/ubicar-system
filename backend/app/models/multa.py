from datetime import date, time, datetime
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, Date, Time, Numeric, String, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Multa(Base):
    __tablename__ = "multas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Vehículo: siempre requerido (la multa es al auto)
    vehiculo_id: Mapped[int | None] = mapped_column(ForeignKey("vehiculos.id"), nullable=True, index=True)
    # Patente desnormalizada para búsqueda rápida (incluso si el vehículo se da de baja)
    patente: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Cliente responsable (se asigna tras el cruce con historial de alquileres)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    # Alquiler al que se vincula (se asigna tras el cruce)
    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True, index=True)

    # Datos de la infracción
    fecha_infraccion: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    hora_infraccion: Mapped[time | None] = mapped_column(Time(), nullable=True)
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # D-28: hasta la migración 045 no había forma de saber cuándo había que
    # pagarla. Nullable porque muchas llegan sin fecha clara, y exigirla
    # impediría cargar la multa — que es lo primero que hay que poder hacer.
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date(), nullable=True, index=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Estado de gestión
    estado: Mapped[str] = mapped_column(
        SAEnum("pendiente", "imputada", "cobrada", "apelando", "bonificada", name="estado_multa"),
        nullable=False,
        default="pendiente",
    )

    # Archivo adjunto (PDF de la multa)
    pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Cuándo pasó a "imputada" (Fase 2: la regla "imputada sin cobrar > 15
    # días" la necesita — antes no se registraba en ningún lado).
    fecha_imputada: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Resolución (D-19 style): quién decidió cobrarla o bonificarla, y por qué
    motivo_bonificacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    resuelto_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    resuelto_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relaciones
    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo", foreign_keys=[vehiculo_id])
    cliente: Mapped["Cliente"] = relationship("Cliente", foreign_keys=[cliente_id])
    alquiler: Mapped["Alquiler"] = relationship("Alquiler", foreign_keys=[alquiler_id])
