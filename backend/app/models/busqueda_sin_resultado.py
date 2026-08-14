from datetime import date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BusquedaSinResultado(Base):
    """
    Demanda insatisfecha (plan de conexión 13/08, §3.9 — mitad de D-04 que se
    salva).

    El cartel de derivación comercial le ofrece a quien busca sin resultado
    un camino directo a WhatsApp — **no una consulta que alguien tiene que
    atender**. Pero D-04 pedía además "medir la demanda insatisfecha por
    categoría — el dato que dice qué auto conviene comprar", y eso se
    perdería si sólo se registrara al que completa el formulario de contacto
    (una minoría, ahora que el WhatsApp es el camino principal).

    Por eso esto es **estadística, no una entidad de negocio**: no tiene
    contacto, no aparece en ninguna bandeja, no dispara ninguna notificación.
    Es una fila que se escribe sola cuando el cartel aparece, para que dentro
    de un mes se pueda contestar "¿cuántos SUV pedimos y no teníamos en
    enero?" sin haber tenido que perseguir a nadie por el dato.
    """
    __tablename__ = "busquedas_sin_resultado"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # `None` cuando el motivo no es "sin cupo" (ventana de anticipación,
    # horizonte o duración no dependen de la categoría).
    categoria_id: Mapped[int | None] = mapped_column(ForeignKey("categorias.id"), nullable=True, index=True)

    fecha_inicio: Mapped[date | None] = mapped_column(Date(), nullable=True)
    fecha_fin: Mapped[date | None] = mapped_column(Date(), nullable=True)

    # sin_cupo | anticipacion | horizonte | duracion | otro_lugar
    motivo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # whatsapp | telefono | mail | seguir_web | consulta — cuál camino del cartel
    # se tocó. Es el dato que dice si el segundo botón ("seguir en la web")
    # se está pagando solo, o si el cartel está mal puesto.
    boton_elegido: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
