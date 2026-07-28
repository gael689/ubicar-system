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

    Desde la Fase 5 (ítem 58) es también **la unidad de venta de la web**: el
    cliente reserva una categoría, no un auto. Por eso los campos de
    presentación (foto, specs) viven acá y no en el vehículo: es lo que se
    muestra en la grilla de disponibilidad, antes de que exista un auto
    asignado.
    """
    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(String(50), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Presentación en la web (Fase 5, ítem 58) ──────────────────────────
    # Foto representativa de la categoría. Key del storage (mismo IStorage
    # que documentos y fotos de daños), no una URL: así funciona igual con
    # almacenamiento local hoy y con R2 cuando se migre.
    foto_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Specs que el cliente compara antes de elegir. Son de la categoría, no
    # del auto: dos compactos distintos tienen que ser intercambiables, si no
    # no serían la misma categoría.
    pasajeros: Mapped[int | None] = mapped_column(Integer, nullable=True)
    valijas: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transmision: Mapped[str | None] = mapped_column(String(20), nullable=True)  # manual | automatica
    aire_acondicionado: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Ejemplo textual: "Fiat Cronos, VW Virtus o similar". Es lo que se
    # muestra en la web — nunca se promete un modelo puntual.
    ejemplo_modelos: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Permite sacar una categoría de la web sin darla de baja del sistema.
    visible_web: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
