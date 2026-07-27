from datetime import date, time, datetime
from decimal import Decimal
from sqlalchemy import String, DateTime, Enum, ForeignKey, Time, Date, Boolean, Numeric, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Reserva(Base):
    __tablename__ = "reservas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int] = mapped_column(ForeignKey("vehiculos.id"), nullable=False, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    fecha_inicio: Mapped[date] = mapped_column(Date(), nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time(), nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date(), nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time(), nullable=False)
    lugar_entrega: Mapped[str] = mapped_column(String(255), nullable=False)
    lugar_devolucion: Mapped[str] = mapped_column(String(255), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(
        Enum("pendiente", "confirmada", "activa", "vencida", "finalizada", "cancelada", name="estado_reserva"),
        nullable=False,
        default="pendiente",
    )
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Conductor != pagador (Fase 1, ítem 20): si es NULL, el cliente es quien
    # maneja (comportamiento de siempre). Si se define, apunta a uno de los
    # conductores_adicionales del propio cliente — típico en empresas, donde
    # quien paga/firma no es quien retira el auto.
    conductor_id: Mapped[int | None] = mapped_column(ForeignKey("conductores_adicionales.id"), nullable=True)

    # ── Fase 3 — campos nuevos ────────────────────────────────────────────────
    # D1 late checkout
    hora_devolucion_acordada: Mapped[time | None] = mapped_column(Time(), nullable=True)
    late_checkout: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    cargo_late_checkout: Mapped[Decimal] = mapped_column(Numeric(12, 2), server_default="0", nullable=False)

    # tarifa y precio total (se rellena al confirmar, actualizable al extender)
    tarifa_aplicada_id: Mapped[int | None] = mapped_column(ForeignKey("tarifas.id"), nullable=True)
    precio_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Descuentos auditados (Fase 1, ítem 22): precio_lista es lo que salió de
    # la tarifa; si precio_total termina siendo distinto, es un descuento (o
    # recargo) manual que exige motivo y queda registrado quién lo autorizó.
    precio_lista: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    descuento_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    descuento_autorizado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    con_factura: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)

    # Política de cancelación (D-11): motivo obligatorio, la seña no se
    # devuelve — el service genera el asiento correspondiente.
    motivo_cancelacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    # D2 solapamiento con pendientes
    bloqueada_por_solape: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)

    # Garantía / depósito (se define en la reserva)
    garantia_tipo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    garantia_monto: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    garantia_tarjeta_numero: Mapped[str | None] = mapped_column(String(20), nullable=True)
    garantia_tarjeta_vencimiento: Mapped[str | None] = mapped_column(String(10), nullable=True)
    garantia_tarjeta_titular: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Pago y anticipos
    forma_pago_prevista: Mapped[str | None] = mapped_column(String(30), nullable=True)
    estado_pago: Mapped[str] = mapped_column(String(20), server_default="pendiente", nullable=False, default="pendiente")
    anticipo_monto: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    anticipo_fecha: Mapped[date | None] = mapped_column(Date(), nullable=True)
    anticipo_medio_pago: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Condición de pago del saldo (Fase 3-bis): decisión de la reserva, no un
    # default silencioso del cliente. Mismos valores que
    # CuentaCorriente.condicion_pago (domain/cuenta_corriente.py::DIAS_POR_CONDICION).
    condicion_pago: Mapped[str] = mapped_column(String(20), server_default="contado", nullable=False, default="contado")
    # Desde cuándo se cuentan los días del plazo — sin default implícito, lo
    # elige quien carga la reserva. 'checkout' | 'checkin' | 'fecha_especifica'.
    condicion_pago_ancla: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Sólo si condicion_pago_ancla == 'fecha_especifica'.
    condicion_pago_fecha_ancla: Mapped[date | None] = mapped_column(Date(), nullable=True)

    # Factura (sólo descriptivo por ahora — sin integración AFIP real, ver
    # Plan Maestro decisión #5).
    tipo_factura: Mapped[str | None] = mapped_column(String(1), nullable=True)
    factura_a_nombre_de: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Datos del echeq cuando el medio de pago (previsto o del anticipo) es
    # "echeq" — todos opcionales: se puede dejar pendiente y completarlos
    # después desde la ficha del cliente o el módulo de Echeqs. Si el cliente
    # está cargado, ReservaService.create() ya crea el Echeq vinculado
    # (Echeq.reserva_id) con estos datos, completos o no.
    echeq_banco: Mapped[str | None] = mapped_column(String(100), nullable=True)
    echeq_numero_cheque: Mapped[str | None] = mapped_column(String(50), nullable=True)
    echeq_fecha_cobro: Mapped[date | None] = mapped_column(Date(), nullable=True)

    # ── Relaciones ────────────────────────────────────────────────────────────
    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo")
    cliente: Mapped["Cliente"] = relationship("Cliente")
    conductor: Mapped["ConductorAdicional"] = relationship("ConductorAdicional")
    usuario: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[usuario_id])
    tarifa_aplicada: Mapped["Tarifa"] = relationship("Tarifa", foreign_keys=[tarifa_aplicada_id])
    alquiler: Mapped["Alquiler"] = relationship("Alquiler", back_populates="reserva", uselist=False)

    @property
    def alquiler_id(self) -> int | None:
        return self.alquiler.id if self.alquiler else None

    @property
    def alquiler_estado(self) -> str | None:
        """
        "activo" mientras el alquiler tiene checkout pero no checkin (el auto está afuera).
        "finalizado" una vez registrado el checkin. None si no hay alquiler (reserva sin checkout).

        Nota: el modelo Alquiler no tiene columna `estado` propia — se deriva de checkin_fecha.
        Antes de este fix, este property intentaba leer `self.alquiler.estado` (columna inexistente),
        lo que lanzaba AttributeError silenciado por Pydantic (default None) y dejaba el botón de
        Check-in sin poder mostrarse nunca en el frontend, para ningún alquiler.
        """
        if not self.alquiler:
            return None
        return "finalizado" if self.alquiler.checkin_fecha is not None else "activo"

    # ── Índices compuestos ────────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_reservas_vehiculo_fecha_inicio", "vehiculo_id", "fecha_inicio"),
    )
