from datetime import datetime, date
from sqlalchemy import String, Boolean, DateTime, Enum, Numeric, Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Tarifa(Base):
    """
    Precio por día para una banda (diaria/semanal/mensual — ver
    domain/tarifas.py, PRE-01). Puede ser específica de un vehículo
    (`vehiculo_id`), de una categoría (`categoria_id`), o general (ambos
    NULL) — mutuamente excluyente en la práctica (D-08), validado en
    TarifaService, no con constraint de base. Prioridad al buscar:
    vehículo específico > categoría > general.
    """
    __tablename__ = "tarifas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehiculos.id"), nullable=True, index=True
    )
    categoria_id: Mapped[int | None] = mapped_column(
        ForeignKey("categorias.id"), nullable=True, index=True
    )
    tipo: Mapped[str] = mapped_column(
        Enum("diaria", "semanal", "mensual", name="tipo_tarifa"), nullable=False
    )
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    vigencia_desde: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)

    # Tarifa de relleno, sembrada para que la categoría pueda cotizar antes de
    # que alguien cargue el precio real (migración 058). **Mientras esté en
    # True, la campana sigue reclamando esa categoría**: sin la marca, sembrar
    # la tarifa apagaría el aviso `categoria_sin_precio` y el recordatorio de
    # poner el precio de verdad desaparecería justo cuando empieza a hacer
    # falta. Se limpia sola: cargar una tarifa diaria nueva desactiva la
    # anterior, así que la genérica pasa al histórico.
    es_generica: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
