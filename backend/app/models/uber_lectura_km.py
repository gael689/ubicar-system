from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UberLecturaKm(Base):
    """
    Una lectura del odómetro de un auto que está en un contrato de Uber
    (migración 110).

    **Por qué existe.** El kilometraje de un contrato de Uber se controlaba una
    sola vez, en el check-in final: un chofer podía pasarse del tope durante dos
    meses y nadie se enteraba hasta el día de la devolución, cuando la cuenta ya
    era impagable. Con una lectura por semana se le avisa a tiempo.

    **No cobra nada.** El excedente se sigue asentando al cierre
    (`AlquilerService.checkin`), contra el tope del contrato entero. Esto es
    sólo el dato; la cuenta la hace `domain/uber.py::consumo_de_km`.
    """
    __tablename__ = "uber_lecturas_km"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    alquiler_id: Mapped[int] = mapped_column(
        ForeignKey("alquileres.id"), nullable=False, index=True
    )
    fecha: Mapped[date] = mapped_column(Date(), nullable=False)
    km: Mapped[int] = mapped_column(Integer, nullable=False)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
