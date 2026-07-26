from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Boolean, Numeric, ForeignKey, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Pago(Base):
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    alquiler_id: Mapped[int] = mapped_column(ForeignKey("alquileres.id"), nullable=False, index=True)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    medio_pago: Mapped[str] = mapped_column(
        Enum("efectivo", "transferencia", "tarjeta", "cheque", "echeq", name="medio_pago"),
        nullable=False,
    )
    con_factura: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cobrado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date(), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    alquiler: Mapped["Alquiler"] = relationship("Alquiler", back_populates="pagos")
