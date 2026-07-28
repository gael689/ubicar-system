from datetime import date, time, datetime
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, Numeric, Integer, ForeignKey, Text, Date, Time, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Alquiler(Base):
    __tablename__ = "alquileres"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reserva_id: Mapped[int] = mapped_column(
        ForeignKey("reservas.id"), nullable=False, unique=True, index=True
    )

    # ── Checkout ──────────────────────────────────────────────────────────────
    checkout_fecha: Mapped[date] = mapped_column(Date(), nullable=False)
    checkout_hora: Mapped[time] = mapped_column(Time(), nullable=False)
    checkout_km: Mapped[int] = mapped_column(Integer, nullable=False)
    checkout_combustible: Mapped[int] = mapped_column(Integer, nullable=False)
    checkout_descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    checkout_registrado_en_tiempo_real: Mapped[bool] = mapped_column(
        Boolean, server_default="true", nullable=False
    )
    checkout_estado_limpieza: Mapped[str | None] = mapped_column(
        SAEnum("limpio", "sucio", "requiere_lavado_profundo", name="estado_limpieza"), nullable=True
    )
    # D-17: "late check-out" en vez de un estado NO_SHOW — si el auto sale
    # más tarde de lo previsto (reserva.hora_inicio vs el checkout real),
    # monto editable + nota obligatoria. Mismo patrón que cargo_late_checkout
    # (que existe en Reserva) pero para la entrega, no la devolución.
    cargo_checkout_tardio: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    motivo_checkout_tardio: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Checkin ───────────────────────────────────────────────────────────────
    checkin_fecha: Mapped[date | None] = mapped_column(Date(), nullable=True)
    checkin_hora: Mapped[time | None] = mapped_column(Time(), nullable=True)
    checkin_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checkin_combustible: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checkin_descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    checkin_registrado_en_tiempo_real: Mapped[bool] = mapped_column(
        Boolean, server_default="true", nullable=False
    )
    checkin_estado_limpieza: Mapped[str | None] = mapped_column(
        SAEnum("limpio", "sucio", "requiere_lavado_profundo", name="estado_limpieza"), nullable=True
    )

    # ── Garantía / Depósito ───────────────────────────────────────────────────
    garantia_tipo: Mapped[str | None] = mapped_column(
        SAEnum("efectivo", "tarjeta", "transferencia", "no_aplica", name="tipo_garantia"), nullable=True
    )
    garantia_monto: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    garantia_estado: Mapped[str | None] = mapped_column(
        SAEnum("retenida", "devuelta", "ejecutada_parcial", name="estado_garantia"), nullable=True
    )
    garantia_monto_devuelto: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # ── Excedente (D6 cobro granular) ─────────────────────────────────────────
    # horas_excedidas: horas reales de excedente (floor, post-gracia)
    horas_excedidas: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    # horas_cobradas: las que el admin decidió cobrar (0 si bonificó)
    horas_cobradas: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    cargo_excedente: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    excedente_bonificado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # decidido_por: usuario que registró el checkin (antes bonificado_por)
    decidido_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    motivo_bonificacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Cargos de cierre (Fase 1, ítem 24) ────────────────────────────────────
    # Montos editables por el operador — no hay capacidad de tanque por
    # vehículo (decisión explícita: el nivel de combustible es sólo visual,
    # no se calculan litros). El nivel checkout/checkin ya documenta el motivo.
    cargo_combustible: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    cargo_limpieza: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # ── Contrato ──────────────────────────────────────────────────────────────
    contrato_firmado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    contrato_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # D-34: entregar sin contrato firmado **es posible** — el día que falle el
    # PDF o se corte internet, el negocio no se para. Pero queda constancia
    # visible en el listado, no un dato enterrado en la auditoría.
    entregado_sin_contrato: Mapped[bool] = mapped_column(
        Boolean, server_default="false", default=False, nullable=False
    )
    motivo_sin_contrato: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relaciones ────────────────────────────────────────────────────────────
    reserva: Mapped["Reserva"] = relationship("Reserva", back_populates="alquiler")
    pagos: Mapped[list["Pago"]] = relationship("Pago", back_populates="alquiler")
    contrato: Mapped["Contrato"] = relationship("Contrato", back_populates="alquiler", uselist=False)
    usuario_decision: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[decidido_por])
