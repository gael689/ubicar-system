from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Categoria(Base):
    """
    Categoría de vehículo (D-08): compacto, sedán, sedán superior, SUV,
    pick-up, furgón. Cada vehículo se asigna a una — las tarifas se pueden
    cargar por categoría o por vehículo puntual (el vehículo específico
    gana, ver domain/tarifas.py::seleccionar_tarifa).

    Campos "para la web" (foto representativa, specs de pasajeros/valijas/
    transmisión/aire) quedan afuera por ahora — son de la Fase 5, cuando la
    reserva pase a ser por categoría en vez de por vehículo puntual.
    """
    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(String(50), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
