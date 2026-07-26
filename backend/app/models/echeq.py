from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Numeric, ForeignKey, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Echeq(Base):
    __tablename__ = "echeqs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    tipo: Mapped[str] = mapped_column(
        Enum("emitido", "recibido", name="tipo_echeq"), nullable=False
    )
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    fecha_emision: Mapped[date] = mapped_column(Date(), nullable=False)
    fecha_cobro: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    estado: Mapped[str] = mapped_column(
        Enum(
            "pendiente",  # legacy — no usar en registros nuevos
            "en_cartera", "depositado", "endosado",
            "cobrado", "rechazado", "vencido",
            name="estado_echeq",
        ),
        nullable=False,
        default="en_cartera",
    )
    contraparte: Mapped[str] = mapped_column(String(255), nullable=False)
    banco: Mapped[str] = mapped_column(String(100), nullable=False)
    numero_cheque: Mapped[str] = mapped_column(String(50), nullable=False)
    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True)
    gasto_id: Mapped[int | None] = mapped_column(ForeignKey("gastos.id"), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
