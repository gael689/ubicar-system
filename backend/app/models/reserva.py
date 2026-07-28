from datetime import date, time, datetime
from decimal import Decimal
from sqlalchemy import String, DateTime, Enum, ForeignKey, Time, Date, Boolean, Numeric, Text, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Reserva(Base):
    __tablename__ = "reservas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Nullable desde la Fase 5 (ítem 58): una reserva web se hace **por
    # categoría** y el auto puntual se asigna al entregar, que es como
    # funcionan las rentadoras reales — si un auto se rompe se reemplaza sin
    # tocar la reserva.
    #
    # **Invariante: al menos uno de `vehiculo_id` / `categoria_id` tiene que
    # estar** (lo valida ReservaService, no un constraint, porque el mensaje
    # de error importa). Una reserva sin vehículo NO es una reserva sin auto:
    # descuenta cupo igual, sólo que todavía no se sabe cuál.
    #
    # `checkout()` sí exige `vehiculo_id`: no se puede entregar una categoría.
    vehiculo_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehiculos.id"), nullable=True, index=True
    )
    categoria_id: Mapped[int | None] = mapped_column(
        ForeignKey("categorias.id"), nullable=True, index=True
    )
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    fecha_inicio: Mapped[date] = mapped_column(Date(), nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time(), nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date(), nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time(), nullable=False)
    lugar_entrega: Mapped[str] = mapped_column(String(255), nullable=False)
    lugar_devolucion: Mapped[str] = mapped_column(String(255), nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(
        Enum(
            "pendiente", "confirmada", "activa", "vencida", "finalizada", "cancelada",
            # Reservas web (migración 047). Ninguno ocupa calendario:
            # `pendiente_pago` toma cupo vía el hold, no vía la reserva.
            "pendiente_pago", "sin_disponibilidad", "revision_sin_cupo",
            name="estado_reserva",
            create_type=False,
        ),
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
    categoria: Mapped["Categoria"] = relationship("Categoria")
    cliente: Mapped["Cliente"] = relationship("Cliente")
    conductor: Mapped["ConductorAdicional"] = relationship("ConductorAdicional")
    usuario: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[usuario_id])
    tarifa_aplicada: Mapped["Tarifa"] = relationship("Tarifa", foreign_keys=[tarifa_aplicada_id])
    alquiler: Mapped["Alquiler"] = relationship("Alquiler", back_populates="reserva", uselist=False)

    # Coberturas y extras contratados (Fase 5, ítem 56). Cada línea congela su
    # precio: ver ReservaAdicional en models/adicional.py.
    adicionales: Mapped[list["ReservaAdicional"]] = relationship(
        "ReservaAdicional", cascade="all, delete-orphan"
    )

    # ── Origen y bandeja web (migración 047) ─────────────────────────────────
    # Sin `origen` no se puede armar la bandeja: una reserva web y una de
    # mostrador son la misma tabla y hay que poder distinguirlas.
    origen: Mapped[str] = mapped_column(
        String(20), server_default="mostrador", default="mostrador", nullable=False, index=True
    )
    web_resuelta_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    web_resuelta_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    web_motivo_rechazo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # El contacto se guarda en la reserva y no sólo en el cliente porque una
    # solicitud SIN_DISPONIBILIDAD puede no llegar nunca a crear un cliente, y
    # ese contacto es justamente lo que no se quiere perder (D-04).
    web_contacto_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)
    web_contacto_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    web_contacto_telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # ── Recargo por edad del conductor (D-38, migración 044) ─────────────────
    # Congelado igual que los adicionales: cambiar la tabla de recargos no
    # puede reescribir lo que ya se pactó. Se guarda también la edad con la
    # que se cotizó, sin la cual el importe no se puede explicar meses
    # después, cuando el conductor ya cumplió años.
    recargo_edad_id: Mapped[int | None] = mapped_column(
        ForeignKey("recargos_edad.id"), nullable=True
    )
    recargo_edad_nombre: Mapped[str | None] = mapped_column(String(120), nullable=True)
    recargo_edad_monto: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), server_default="0", nullable=False, default=0
    )
    recargo_edad_edad: Mapped[int | None] = mapped_column(Integer, nullable=True)

    @property
    def alquiler_id(self) -> int | None:
        return self.alquiler.id if self.alquiler else None

    @property
    def total_adicionales(self) -> Decimal:
        """
        Suma de los adicionales contratados.

        **Vive fuera de `precio_total` a propósito**, igual que
        `cargo_late_checkout`: `precio_total` vs `precio_lista` es la
        auditoría del descuento sobre el alquiler del vehículo, y meter el
        seguro ahí adentro haría que un seguro caro se leyera como un recargo
        no autorizado. Los conceptos se suman recién al facturar
        (`AlquilerService.checkout`), que es el patrón que el sistema ya usa.
        """
        return sum((a.subtotal for a in self.adicionales), Decimal("0"))

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
