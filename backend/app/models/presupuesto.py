from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Presupuesto(Base):
    __tablename__ = "presupuestos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True)
    vehiculo_id: Mapped[int | None] = mapped_column(ForeignKey("vehiculos.id"), nullable=True)
    fecha_inicio: Mapped[str] = mapped_column(String(10), nullable=False)
    fecha_fin: Mapped[str] = mapped_column(String(10), nullable=False)
    dias: Mapped[int] = mapped_column(Integer, nullable=False)
    tarifa_unitaria: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    descuento: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    estado: Mapped[str] = mapped_column(
        Enum("borrador", "enviado", "aceptado", "vencido", name="estado_presupuesto"),
        nullable=False,
        default="borrador",
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    cliente: Mapped["Cliente"] = relationship("Cliente")
    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo")
