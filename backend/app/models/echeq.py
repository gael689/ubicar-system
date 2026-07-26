from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Numeric, Boolean, ForeignKey, Text, Enum
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
    fecha_acreditacion: Mapped[date | None] = mapped_column(Date(), nullable=True)
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

    # Recibido de un cliente (genera crédito en su cuenta corriente al entrar
    # en cartera). Nullable: un echeq emitido va a un proveedor, no a un
    # cliente propio.
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    proveedor_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)

    motivo_rechazo: Mapped[str | None] = mapped_column(Text, nullable=True)

    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True)
    gasto_id: Mapped[int | None] = mapped_column(ForeignKey("gastos.id"), nullable=True)
    cuenta_corriente_id: Mapped[int | None] = mapped_column(ForeignKey("cuentas_corrientes.id"), nullable=True)
    movimiento_cc_id: Mapped[int | None] = mapped_column(
        ForeignKey("movimientos_cuenta_corriente.id"), nullable=True
    )

    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
