from datetime import datetime, date
from sqlalchemy import String, Date, Numeric, ForeignKey, Text, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Gasto(Base):
    __tablename__ = "gastos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int] = mapped_column(ForeignKey("vehiculos.id"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(
        Enum(
            "service", "combustible", "cubiertas", "reparacion",
            "seguro", "patente", "vtv", "lavado", "otro",
            name="tipo_gasto",
        ),
        nullable=False,
    )
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    medio_pago: Mapped[str] = mapped_column(
        Enum("efectivo", "transferencia", "tarjeta", "cheque", "echeq", name="medio_pago_gasto"),
        nullable=False,
    )
    fecha: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    proveedor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    km_al_momento: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo")
