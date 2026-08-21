from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# El signo de cada tipo, visto desde el cajón. Es la única definición: la caja
# del día, el arqueo y cualquier reporte futuro la usan en vez de repetir un
# `if tipo == ...` que en algún momento va a discrepar.
SIGNO_EN_CAJA: dict[str, int] = {
    "deposito_banco": -1,     # sale del cajón, entra al banco
    "retiro": -1,             # sale del cajón, se lo lleva alguien
    "garantia_recibida": +1,  # entra al cajón (pero no es de la empresa)
    "garantia_devuelta": -1,  # vuelve al cliente
    "reembolso": -1,          # se le devuelve plata a un cliente
}


class MovimientoCaja(Base):
    """
    Plata que se mueve **sin ser de nadie en particular**.

    `pagos` dice cuánto entró y `gastos` cuánto salió, pero ninguno de los dos
    contesta *dónde quedó*. Un depósito al banco no le cambia el saldo a ningún
    cliente: la plata sigue siendo de la empresa, cambió de lugar. Una garantía
    en efectivo entra al cajón y **no** toca la cuenta corriente (D-27). Un
    reembolso sale del cajón y no es un gasto de ningún vehículo — por eso
    `Gasto` no servía: su `vehiculo_id` es `NOT NULL`.

    **Sin arqueo y sin bloqueo.** Esto no es un saldo que alguien confirma al
    cerrar el día: es la lista de los movimientos, y el efectivo acumulado es
    un número calculado a partir de ella. Un arqueo que hay que confirmar todos
    los días termina confirmándose sin mirar.
    """
    __tablename__ = "movimientos_caja"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    fecha: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(
        Enum(
            "deposito_banco", "retiro", "garantia_recibida",
            "garantia_devuelta", "reembolso",
            name="tipo_movimiento_caja",
        ),
        nullable=False,
        index=True,
    )
    # Siempre positivo: el signo lo define el tipo (ver `SIGNO_EN_CAJA`), no el
    # monto. Dos formas de decir lo mismo terminan discrepando.
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    medio: Mapped[str] = mapped_column(String(30), nullable=False)
    # Obligatorio: es plata moviéndose sin un evento del sistema detrás.
    motivo: Mapped[str] = mapped_column(Text, nullable=False)

    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    reserva_id: Mapped[int | None] = mapped_column(ForeignKey("reservas.id"), nullable=True)
    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True)
    movimiento_cc_id: Mapped[int | None] = mapped_column(
        ForeignKey("movimientos_cuenta_corriente.id"), nullable=True
    )

    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    anulado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def efecto_en_caja(self) -> Decimal:
        """Cuánto suma (o resta) este movimiento al efectivo del cajón."""
        return Decimal(str(self.monto)) * SIGNO_EN_CAJA.get(self.tipo, 0)
