from datetime import date, datetime, time
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# Los tres casos en que la web no cierra la venta sola (D-61).
MOTIVOS = ("fuera_de_ventana", "sin_cupo", "otro_lugar")


class SolicitudContacto(Base):
    """
    Alguien pidió que lo llamemos. **No es una reserva** (D-61).

    Es la segunda salida del panel de derivación: la primera son los tres
    canales de Ubicar —WhatsApp, teléfono, mail—, y esta es para el que
    prefiere dejar sus datos y que lo contacten. El pedido fue explícito:
    *"si los contactamos nosotros, se tiene que ver esta solicitud de reserva
    desde el sistema, diferenciado de cuando reservan realmente"*.

    **Por qué una tabla y no un estado más en `reservas`:** hasta ahora este
    camino era `/public/solicitudes`, que crea una fila en `reservas` con
    estado `sin_disponibilidad`. Por eso el mostrador no podía distinguirla de
    una venta: literalmente era una reserva, con su cliente, su usuario y su
    lugar de entrega inventados. Acá no hay nada que inventar — quien pide una
    llamada todavía no eligió auto, no tiene cliente cargado y puede no tener
    ni siquiera fechas.

    Ninguna columna es obligatoria salvo el motivo, el nombre y el teléfono:
    **este registro nunca puede fallar en guardarse.** Es la última red antes
    de perder el contacto.
    """
    __tablename__ = "solicitudes_contacto"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    # Por qué cayó acá — lo primero que el mostrador necesita saber antes de
    # levantar el teléfono: no es lo mismo "quiere para pasado mañana" que
    # "quiere que se lo llevemos al campo".
    motivo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    telefono: Mapped[str] = mapped_column(String(30), nullable=False)
    # Opcional a propósito: el pedido es "que me llamen". Exigir el mail es un
    # campo más entre la persona y el envío, y el mostrador va a usar el
    # teléfono igual. Si hace falta para mandar cotización, se pide al llamar.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Sólo en `sin_cupo` — en los otros dos casos todavía no eligió vehículo.
    categoria_id: Mapped[int | None] = mapped_column(
        ForeignKey("categorias.id"), nullable=True, index=True
    )

    fecha_inicio: Mapped[date | None] = mapped_column(Date(), nullable=True)
    fecha_fin: Mapped[date | None] = mapped_column(Date(), nullable=True)
    hora_inicio: Mapped[time | None] = mapped_column(Time(), nullable=True)
    hora_fin: Mapped[time | None] = mapped_column(Time(), nullable=True)

    lugar_retiro: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lugar_devolucion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Lo que tipeó en "Otro lugar". **Vive acá y no en `lugar_retiro`**: pegarlo
    # adentro del lugar es lo que D-56 tuvo que sacar, porque desde ahí se
    # filtraba solo a `reservas.lugar_entrega` y quedaba como si fuera un punto
    # de retiro real.
    lugar_texto_libre: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Ya la declaró en el buscador: preguntársela de nuevo por teléfono es
    # gastar la llamada en algo que ya sabemos.
    edad_declarada: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendiente", index=True
    )
    resuelta_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    resuelta_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Qué pasó al llamar: se alquiló, no contestó, quedó para más adelante.
    resultado: Mapped[str | None] = mapped_column(Text, nullable=True)

    categoria: Mapped["Categoria"] = relationship("Categoria", foreign_keys=[categoria_id])
