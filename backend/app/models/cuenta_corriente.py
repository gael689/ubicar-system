from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CuentaCorriente(Base):
    __tablename__ = "cuentas_corrientes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(
        ForeignKey("clientes.id"), nullable=False, unique=True, index=True
    )
    saldo: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    cliente: Mapped["Cliente"] = relationship("Cliente")
    movimientos: Mapped[list["MovimientoCuentaCorriente"]] = relationship(
        back_populates="cuenta_corriente", cascade="all, delete-orphan"
    )


class MovimientoCuentaCorriente(Base):
    __tablename__ = "movimientos_cuenta_corriente"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cuenta_corriente_id: Mapped[int] = mapped_column(
        ForeignKey("cuentas_corrientes.id"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(
        Enum("debito", "credito", name="tipo_movimiento"), nullable=False
    )
    concepto: Mapped[str] = mapped_column(String(255), nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    fecha: Mapped[str] = mapped_column(String(10), nullable=False)
    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True)

    cuenta_corriente: Mapped["CuentaCorriente"] = relationship(back_populates="movimientos")
