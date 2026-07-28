from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Boolean, Numeric, ForeignKey, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Pago(Base):
    """
    Un cobro real. Es **el hecho económico**: es lo que genera el crédito en la
    cuenta corriente y lo que suma a la caja del día.

    El `Recibo` que se le puede emitir encima es sólo el papel que lo documenta
    — no mueve plata (ver migración 043 y PLAN_MAESTRO §2.12).

    `cliente_id` es obligatorio (siempre se le cobra a alguien) y `alquiler_id`
    opcional: un pago puede ser a cuenta, la seña de una reserva que todavía no
    tiene alquiler, o la cancelación de una deuda vieja.
    """
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True, index=True)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    medio_pago: Mapped[str] = mapped_column(
        Enum("efectivo", "transferencia", "tarjeta", "cheque", "echeq", "cuenta_corriente", name="medio_pago"),
        nullable=False,
    )
    con_factura: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cobrado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date(), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    alquiler: Mapped["Alquiler"] = relationship("Alquiler", back_populates="pagos")
