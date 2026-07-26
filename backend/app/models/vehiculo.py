from datetime import datetime
from typing import TYPE_CHECKING, List
from sqlalchemy import String, Boolean, DateTime, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.servicio import Servicio


class Vehiculo(Base):
    __tablename__ = "vehiculos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    patente: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    marca: Mapped[str] = mapped_column(String(100), nullable=False)
    modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    anio: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo: Mapped[str] = mapped_column(
        Enum("auto", "camioneta", name="tipo_vehiculo"), nullable=False
    )
    color: Mapped[str] = mapped_column(String(50), nullable=False)
    estado: Mapped[str] = mapped_column(
        Enum(
            "disponible", "alquilado", "reservado", "en_transicion", "fuera_de_servicio",
            name="estado_vehiculo",
        ),
        nullable=False,
        default="disponible",
    )
    km_actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    km_proximo_service: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    km_entre_services: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    foto_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    servicios: Mapped[List["Servicio"]] = relationship("Servicio", back_populates="vehiculo", order_by="Servicio.fecha.desc()")
