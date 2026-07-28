from datetime import date, datetime

from sqlalchemy import (
    String, Text, Date, DateTime, Boolean, ForeignKey, Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BloqueoVehiculo(Base):
    """
    Período en el que un vehículo no se puede alquilar (Fase 5, ítem 59 —
    plan §7.3).

    **Por qué hace falta si ya existe `Vehiculo.estado = fuera_de_servicio`:**
    ese estado es un booleano del presente — dice "hoy no está", pero no
    tiene fechas. Con él no se puede responder "¿está libre del 3 al 10 de
    septiembre?", que es justamente lo que necesita la disponibilidad de la
    web, ni cargar por adelantado que el auto entra a service el mes que
    viene. Un bloqueo es un rango, y por eso se puede planificar.

    Se integra con `domain/solapamientos.py` como una ventana más: el motor
    de solapamientos ya sabe rechazar reservas contra ventanas ocupadas, así
    que un bloqueo bloquea exactamente igual que una reserva confirmada, sin
    un segundo camino de validación que después se desincronice.

    El rango es **inclusivo en los dos extremos**: un bloqueo del 3 al 5
    ocupa los días 3, 4 y 5 completos. Es lo que espera quien lo carga
    pensando "el auto está en el taller esos tres días".
    """
    __tablename__ = "bloqueos_vehiculo"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int] = mapped_column(
        ForeignKey("vehiculos.id"), nullable=False, index=True
    )
    fecha_desde: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    fecha_hasta: Mapped[date] = mapped_column(Date(), nullable=False, index=True)

    motivo: Mapped[str] = mapped_column(
        SAEnum(
            "mantenimiento",   # service programado, gomería, chapa
            "siniestro",       # chocado, esperando peritaje o repuestos
            "uso_interno",     # lo usa la empresa
            "venta",           # en exhibición / reservado para vender
            "otro",
            name="motivo_bloqueo_vehiculo",
        ),
        nullable=False,
        default="mantenimiento",
        index=True,
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo")

    @property
    def dias(self) -> int:
        """Días que dura el bloqueo, contando ambos extremos."""
        return (self.fecha_hasta - self.fecha_desde).days + 1
