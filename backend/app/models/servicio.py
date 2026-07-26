from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Servicio(Base):
    __tablename__ = "servicios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int] = mapped_column(Integer, ForeignKey("vehiculos.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(
        Enum(
            "service_general", "aceite", "neumaticos", "frenos",
            "filtros", "correa", "suspension", "otro",
            name="tipo_servicio",
        ),
        nullable=False,
    )
    km_realizado: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    costo: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    proximo_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proxima_fecha: Mapped[date | None] = mapped_column(Date, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo", back_populates="servicios")  # type: ignore[name-defined]
