from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Numeric, ForeignKey, Text, Enum, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Recibo(Base):
    """
    Comprobante de cobro entregado al cliente. Genera un crédito en su cuenta
    corriente (mismo mecanismo que pago/echeq — ver CuentaCorrienteService).

    numero se asigna vía secuencia de Postgres (recibos_numero_seq), nunca
    MAX(numero)+1, para que sea seguro bajo concurrencia (D-14).

    Nunca se edita ni se borra (ver [[regla-nunca-eliminar]]): anular un
    recibo lo pasa a estado='anulado' + revierte el crédito con un
    contra-asiento en la cuenta corriente (mismo patrón que multa
    bonificada — ver [[multa-cc-patron-cargos-extra]]).
    """
    __tablename__ = "recibos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    numero: Mapped[int] = mapped_column(
        nullable=False, unique=True, index=True,
        server_default=text("nextval('recibos_numero_seq')"),
    )
    # Fijo en "R" por ahora (D-14): no es comprobante fiscal, no tiene punto de
    # venta AFIP. Se deja preparado para no migrar si el día de mañana emiten
    # desde más de un lugar o incorporan facturación.
    prefijo: Mapped[str] = mapped_column(String(5), nullable=False, default="R")

    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    cuenta_corriente_id: Mapped[int] = mapped_column(ForeignKey("cuentas_corrientes.id"), nullable=False)

    # El pago que este recibo documenta (migración 043). **El recibo no mueve
    # plata**: el crédito en la cuenta corriente lo generó el `Pago`. Antes de
    # esa migración el recibo generaba su propio asiento y el resultado era un
    # doble crédito por el mismo cobro (PLAN_MAESTRO §2.12).
    pago_id: Mapped[int | None] = mapped_column(ForeignKey("pagos.id"), nullable=True, index=True)

    # Nullable desde la 043: los recibos nuevos no generan movimiento propio.
    # Los emitidos antes conservan el suyo, que ahora cuelga del pago.
    movimiento_cc_id: Mapped[int | None] = mapped_column(
        ForeignKey("movimientos_cuenta_corriente.id"), nullable=True
    )

    fecha: Mapped[date] = mapped_column(Date(), nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    medio_pago: Mapped[str] = mapped_column(
        Enum("efectivo", "transferencia", "tarjeta", "cheque", "echeq", name="medio_pago_recibo"),
        nullable=False,
    )
    concepto: Mapped[str] = mapped_column(Text, nullable=False)

    saldo_anterior: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    saldo_posterior: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    estado: Mapped[str] = mapped_column(
        Enum("emitido", "anulado", name="estado_recibo"), nullable=False, default="emitido"
    )
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    anulado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    archivo_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    cliente: Mapped["Cliente"] = relationship("Cliente")
