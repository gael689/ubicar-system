from datetime import date, datetime
from sqlalchemy import String, Text, Date, DateTime, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class FechaEspecial(Base):
    """
    Fecha o rango con relevancia comercial: feriados, fines de semana largos,
    Navidad, Día del Amigo, temporada alta.

    Cumple dos funciones, en este orden:

    1. **Hoy**: que el administrador las VEA en el calendario de ocupación.
       Saber que la semana que viene es Navidad cambia cómo se planifica la
       flota, y hoy esa información no está en ningún lado del sistema.
    2. **Después** (Fase 5, ítem 57): son el ancla de las reglas de
       `tarifas_calendario`. Una regla de precio va a poder apuntar a una
       fecha especial en vez de repetir el rango a mano — así "Navidad 2026"
       se define una sola vez y sirve para el precio y para el calendario.

    Es un rango (`fecha_desde`/`fecha_hasta`), no un día suelto: los dueños
    piensan en "las semanas de Navidad", no en el 25 aislado. Para un día
    único, ambas fechas son iguales.
    """
    __tablename__ = "fechas_especiales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    fecha_desde: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    fecha_hasta: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(
        SAEnum(
            "feriado",        # feriado nacional
            "fin_semana_largo",
            "comercial",      # Día del Amigo, Día de la Madre, San Valentín
            "temporada",      # temporada alta/baja
            "otro",
            name="tipo_fecha_especial",
        ),
        nullable=False,
        default="otro",
    )
    # Color con el que se pinta en el calendario. Se guarda el nombre del
    # token, no un hex: el frontend lo mapea a clases completas de Tailwind
    # (interpolar clases rompe el purge).
    color: Mapped[str] = mapped_column(
        SAEnum("rojo", "ambar", "verde", "azul", "violeta", name="color_fecha_especial"),
        nullable=False,
        default="ambar",
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
