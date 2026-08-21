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
    # De qué reserva es este cobro. **Es lo que permite que un pago anterior al
    # check-out sepa a qué operación pertenece**: el alquiler todavía no existe,
    # pero la reserva sí. Sin esto, el único puente era `PagoWeb.pago_id` —que
    # existe sólo para Mercado Pago— y por eso la Fase 1 sólo pudo arreglar ese
    # camino (`PLAN_DINERO.md` §1.5.a). Nullable: un cobro a cuenta o la
    # cancelación de una deuda vieja no cuelgan de ninguna reserva.
    reserva_id: Mapped[int | None] = mapped_column(ForeignKey("reservas.id"), nullable=True, index=True)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    medio_pago: Mapped[str] = mapped_column(
        # `mercado_pago` (migración 051) es lo que entra por la web. No se
        # reusa "tarjeta" porque la caja del día mezclaría lo cobrado en el
        # mostrador con lo cobrado online, y se concilian contra extractos
        # distintos.
        # `wapa` (migracion 057) es lo que se cobra por Banco Patagonia:
        # mPOS, link de pago o QR. Tampoco se reusa "tarjeta", por lo mismo
        # que `mercado_pago` — se concilia contra otro extracto y tiene otras
        # comisiones.
        Enum("efectivo", "transferencia", "tarjeta", "cheque", "echeq",
             "cuenta_corriente", "mercado_pago", "wapa", name="medio_pago",
             create_type=False),
        nullable=False,
    )
    con_factura: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cobrado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    fecha: Mapped[date] = mapped_column(Date(), nullable=False)
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

    alquiler: Mapped["Alquiler"] = relationship("Alquiler", back_populates="pagos")
