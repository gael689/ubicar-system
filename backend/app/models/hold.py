from datetime import date, datetime, time

from sqlalchemy import String, DateTime, Date, Time, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Hold(Base):
    """
    Cupo reservado mientras el cliente termina de pagar (ítem 61).

    **Por qué existe.** Entre que el cliente elige el auto y termina de pagar
    pasan minutos. Sin tomar el cupo en ese intervalo, dos personas compran la
    última unidad y una se queda sin auto el día que viaja. Retener y avisar
    (decisión #4) es el plan B; el hold es el plan A.

    **Expira solo, y eso es parte del diseño.** `expira_en` se compara al
    consultar disponibilidad, así que un hold vencido deja de ocupar en el
    mismo instante sin que corra ningún job. Un hold sin expiración sería una
    reserva fantasma: alguien abandona el checkout y el auto queda bloqueado
    para siempre.

    Los consumidos no se borran: cuántos se abandonan es el dato que dice si
    la ventana de 20 minutos alcanza.
    """
    __tablename__ = "holds"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Token opaco: no se expone el id, porque adivinar un entero para liberar
    # el hold de otro sería trivial.
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    categoria_id: Mapped[int] = mapped_column(ForeignKey("categorias.id"), nullable=False)
    fecha_inicio: Mapped[date] = mapped_column(Date(), nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time(), nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date(), nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time(), nullable=False)

    expira_en: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    estado: Mapped[str] = mapped_column(
        SAEnum("vigente", "consumido", "liberado", name="estado_hold"),
        nullable=False,
        default="vigente",
    )
    reserva_id: Mapped[int | None] = mapped_column(ForeignKey("reservas.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    @property
    def vigente(self) -> bool:
        return self.estado == "vigente" and self.expira_en > datetime.utcnow()

    @property
    def segundos_restantes(self) -> int:
        """Lo que la web muestra como cuenta regresiva. Nunca negativo."""
        return max(0, int((self.expira_en - datetime.utcnow()).total_seconds()))
