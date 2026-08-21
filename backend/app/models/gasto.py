from datetime import datetime, date
from sqlalchemy import (
    Boolean, DateTime, String, Date, Numeric, ForeignKey, Text, Enum, Integer,
)
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

    # ── Baja lógica (migración 083) ──────────────────────────────────────────
    # **Nada de esto se borra.** Un DELETE saca plata de la caja de un día
    # pasado y no deja ninguna fila que cuente qué había. Con la baja lógica el
    # registro queda, con el motivo, quién y cuándo — y todo lo que lo lee
    # filtra por `anulado = false`.
    anulado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    anulado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo")
