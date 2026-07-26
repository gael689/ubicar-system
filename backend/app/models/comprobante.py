from datetime import datetime, date
from sqlalchemy import String, Text, DateTime, Date, Numeric, Boolean, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Comprobante(Base):
    """
    Factura/nota de crédito/nota de débito/remito — cargados manualmente
    con su PDF (D-05: sin integración AFIP en esta etapa; `cae`/
    `cae_vencimiento` quedan preparados sin usar).

    Sólo nota_credito/nota_debito generan un movimiento nuevo en la cuenta
    corriente (ajustes reales) — factura_a/b/c y remito documentan un cargo
    que el ledger completo ya facturó automáticamente al checkout.

    Nunca se borra (ver [[regla-nunca-eliminar]]): anular pasa a
    estado='anulada' + motivo, y si había generado un movimiento, se revierte
    con contra-asiento — mismo patrón que recibo/multa.
    """
    __tablename__ = "comprobantes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    tipo: Mapped[str] = mapped_column(
        Enum("factura_a", "factura_b", "factura_c", "nota_credito", "nota_debito", "remito", name="tipo_comprobante"),
        nullable=False,
    )
    punto_venta: Mapped[str | None] = mapped_column(String(10), nullable=True)
    numero: Mapped[str] = mapped_column(String(30), nullable=False)
    fecha_emision: Mapped[date] = mapped_column(Date(), nullable=False)
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date(), nullable=True)

    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True)
    reserva_id: Mapped[int | None] = mapped_column(ForeignKey("reservas.id"), nullable=True)

    neto: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    iva: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    # Preparado para AFIP/ARCA — no se usa todavía (D-05).
    cae: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cae_vencimiento: Mapped[date | None] = mapped_column(Date(), nullable=True)

    archivo_key: Mapped[str] = mapped_column(String(512), nullable=False)
    estado: Mapped[str] = mapped_column(
        Enum("emitida", "anulada", "cobrada", name="estado_comprobante"), nullable=False, default="emitida"
    )
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    movimiento_cc_id: Mapped[int | None] = mapped_column(ForeignKey("movimientos_cuenta_corriente.id"), nullable=True)

    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    cliente: Mapped["Cliente"] = relationship("Cliente")
