from datetime import datetime, date
from sqlalchemy import String, Boolean, DateTime, Enum, Numeric, Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Tarifa(Base):
    __tablename__ = "tarifas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehiculos.id"), nullable=True, index=True
    )
    tipo: Mapped[str] = mapped_column(
        Enum("diaria", "semanal", "mensual", name="tipo_tarifa"), nullable=False
    )
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    vigencia_desde: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
