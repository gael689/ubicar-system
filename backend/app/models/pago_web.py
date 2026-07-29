from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON, DateTime, Enum, ForeignKey, Numeric, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PagoWeb(Base):
    """
    Un intento de cobro online. **No es un `Pago`**: es el rastro de la
    conversación con Mercado Pago.

    La distinción importa. `Pago` es el hecho económico —genera el crédito en
    la cuenta corriente y suma a la caja del día (migración 043)— y sólo
    existe cuando la plata entró de verdad. `PagoWeb` existe desde que se abre
    el checkout, incluso si el cliente nunca paga, y guarda los intentos
    rechazados, que son justamente los que hay que poder mirar cuando alguien
    llama diciendo "pagué y no me llegó nada".

    **`payment_id` es único y esa unicidad es la idempotencia** (regla 2 de
    `PLAN_RESERVAS_WEB.md` §6). Mercado Pago reintenta el webhook: sin esta
    restricción, un pago genera dos asientos en la cuenta corriente.
    """

    __tablename__ = "pagos_web"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # La reserva ya existe cuando se crea la preferencia: entra en
    # `pendiente_pago` y el cupo lo sostiene el hold, no la reserva.
    reserva_id: Mapped[int] = mapped_column(
        ForeignKey("reservas.id"), nullable=False, index=True
    )
    # Se guarda el token y no el id del hold para poder liberarlo o consumirlo
    # desde el webhook sin volver a resolver nada.
    hold_token: Mapped[str | None] = mapped_column(String(64), nullable=True)

    preference_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    # La URL de Checkout Pro. Se guarda por dos razones: devolver la misma
    # preferencia ante un doble clic en vez de fabricar una reserva de más, y
    # poder reenviarle el link a alguien que abandonó el pago a mitad de camino.
    init_point: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Nullable hasta que el cliente efectivamente paga: la preferencia se crea
    # antes de que exista ningún pago.
    payment_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True, unique=True, index=True
    )

    # Lo que se le pidió a Mercado Pago. Se compara contra lo que la API dice
    # que se cobró: nunca contra lo que informa el navegador (regla 4).
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    porcentaje_anticipo: Mapped[int] = mapped_column(nullable=False)
    # El total del alquiler al momento de cobrar, congelado. Sin esto, un
    # cambio de precios posterior haría irreconstruible por qué se cobró eso.
    total_reserva: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    descuento_pago_total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), server_default="0", nullable=False, default=Decimal("0")
    )

    estado: Mapped[str] = mapped_column(
        Enum(
            "iniciado",     # preferencia creada, el cliente todavía no volvió
            "aprobado",
            "pendiente",
            "rechazado",
            "devuelto",
            "revision",     # algo no cierra: lo mira una persona
            name="estado_pago_web",
        ),
        nullable=False,
        default="iniciado",
        index=True,
    )
    # `status` crudo de Mercado Pago, sin traducir. Es lo que se compara para
    # decidir si un webhook repetido ya fue procesado.
    estado_externo: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # El `Pago` que se generó al acreditar. Nullable porque la mayoría de los
    # PagoWeb nunca llegan a acreditarse.
    pago_id: Mapped[int | None] = mapped_column(
        ForeignKey("pagos.id"), nullable=True, index=True
    )

    # Respuesta completa de la API, para poder auditar un cobro discutido sin
    # depender de que el panel de Mercado Pago siga mostrando esa operación.
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    procesado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    reserva: Mapped["Reserva"] = relationship("Reserva")
    pago: Mapped["Pago"] = relationship("Pago")
