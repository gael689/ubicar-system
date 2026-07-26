from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Numeric, Boolean, Text, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CuentaCorriente(Base):
    __tablename__ = "cuentas_corrientes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(
        ForeignKey("clientes.id"), nullable=False, unique=True, index=True
    )
    # El saldo se recalcula en cada movimiento (nunca se edita a mano). Positivo = el cliente debe (D-01).
    saldo: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    condicion_pago: Mapped[str | None] = mapped_column(String(20), nullable=True)
    limite_credito: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    bloqueada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    cliente: Mapped["Cliente"] = relationship("Cliente")
    movimientos: Mapped[list["MovimientoCuentaCorriente"]] = relationship(
        back_populates="cuenta_corriente", cascade="all, delete-orphan",
        foreign_keys="MovimientoCuentaCorriente.cuenta_corriente_id",
    )


class MovimientoCuentaCorriente(Base):
    """
    Asiento del ledger de cuenta corriente. Inmutable una vez creado: se
    corrige con un contra-asiento (anulado=True + anulado_por_movimiento_id),
    nunca editando ni borrando (ver [[regla-nunca-eliminar]]).

    Convención de signos (D-01): tipo='debito' aumenta lo que el cliente
    debe; tipo='credito' lo reduce. saldo_posterior es el saldo de la cuenta
    inmediatamente después de este movimiento — permite auditar y detectar
    desincronización sin recorrer todo el historial.
    """
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
    fecha: Mapped[date] = mapped_column(Date(), nullable=False)
    condicion: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date(), nullable=True, index=True)
    saldo_posterior: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True)
    reserva_id: Mapped[int | None] = mapped_column(ForeignKey("reservas.id"), nullable=True)
    pago_id: Mapped[int | None] = mapped_column(ForeignKey("pagos.id"), nullable=True)
    echeq_id: Mapped[int | None] = mapped_column(ForeignKey("echeqs.id"), nullable=True)
    multa_id: Mapped[int | None] = mapped_column(ForeignKey("multas.id"), nullable=True)
    recibo_id: Mapped[int | None] = mapped_column(ForeignKey("recibos.id"), nullable=True)
    comprobante_id: Mapped[int | None] = mapped_column(ForeignKey("comprobantes.id"), nullable=True)

    anulado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    anulado_por_movimiento_id: Mapped[int | None] = mapped_column(
        ForeignKey("movimientos_cuenta_corriente.id"), nullable=True
    )
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    cuenta_corriente: Mapped["CuentaCorriente"] = relationship(
        back_populates="movimientos", foreign_keys=[cuenta_corriente_id]
    )
