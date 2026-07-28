from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    String, Text, DateTime, Boolean, Integer, Numeric, ForeignKey,
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RecargoEdad(Base):
    """
    Recargo sobre el alquiler según la edad del conductor (D-38).

    **No existe una edad mínima.** Se alquila a cualquier edad; lo que cambia
    es el precio. Rechazar por edad pierde la venta entera — recargar la
    conserva y cubre el riesgo, que es como opera el rubro (*young driver
    surcharge*).

    Lo cargan los administradores, no está en el código: la franja y el monto
    son decisiones comerciales que van a cambiar.

    Consecuencia importante: **la fecha de nacimiento pasa a ser necesaria
    para cotizar**, no sólo para validar. Sin ella no se puede saber qué
    precio corresponde.
    """
    __tablename__ = "recargos_edad"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Franja inclusiva en los dos extremos: 18-24 son siete edades.
    edad_desde: Mapped[int] = mapped_column(Integer, nullable=False)
    # None = "de esta edad en adelante", para el recargo a conductores mayores
    # sin tope superior.
    edad_hasta: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Se carga uno de los dos, nunca los dos (hay un CHECK en la base).
    # El porcentaje escala solo con el precio del auto —una pick-up recarga
    # más que un compacto sin cargar dos reglas—; el monto fijo es más fácil
    # de comunicar. Los dos casos existen en el rubro.
    monto: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    porcentaje: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    unidad_cobro: Mapped[str] = mapped_column(
        SAEnum("por_dia", "unico", name="unidad_cobro_adicional", create_type=False),
        nullable=False,
        default="por_dia",
    )

    # None = aplica a todas las categorías.
    categoria_id: Mapped[int | None] = mapped_column(ForeignKey("categorias.id"), nullable=True)

    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
