from datetime import datetime

from sqlalchemy import String, Text, DateTime, Integer, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Auditoria(Base):
    """
    Quién hizo qué, cuándo, y sobre qué registro (plan §6.6).

    **Por qué existe si cada tabla ya guarda `creado_por`.** Ese campo contesta
    "quién creó esto" mirando un registro que todavía existe. No contesta
    "quién anuló el movimiento de $400.000 el martes", "quién le bajó el precio
    a esa reserva" ni "quién dio de baja al cliente" — porque esas acciones no
    crean una fila nueva, modifican una que ya estaba. Con tres personas
    operando y plata de por medio, ese es justamente el registro que hace
    falta.

    **Es un libro de sólo agregar.** No se edita ni se borra: un registro de
    auditoría que se puede modificar no sirve para auditar nada. Por eso no
    tiene `activo` ni entra en la regla de baja lógica del resto del sistema.

    `datos_antes` / `datos_despues` guardan sólo los campos que cambiaron, no
    la fila entera: alcanza para reconstruir qué pasó y evita que la tabla se
    llene de ruido (y de datos personales duplicados).
    """
    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Quién. El nombre va **copiado**, no sólo la FK: si mañana el usuario se
    # da de baja o le cambian el nombre, el registro tiene que seguir diciendo
    # quién era en ese momento.
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True, index=True
    )
    usuario_nombre: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Qué. `accion` es un verbo corto y estable ("crear", "editar", "anular",
    # "cancelar", "dar_de_baja", "reactivar", "cobrar", "bonificar").
    accion: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entidad_tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entidad_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # Una línea en castellano, ya armada. Es lo que se lee en la pantalla sin
    # tener que interpretar los JSON — y lo que sobrevive aunque el formato de
    # los datos cambie.
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)

    datos_antes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    datos_despues: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Plata involucrada, si la hay. Suelto y no adentro del JSON porque es lo
    # que se quiere filtrar y ordenar ("mostrame todo lo de más de $100.000").
    monto: Mapped[float | None] = mapped_column(nullable=True)

    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)  # 45 = IPv6

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    usuario: Mapped["Usuario"] = relationship("Usuario")

    __table_args__ = (
        # La consulta natural es "todo lo que le pasó a esta reserva", y sin
        # este índice compuesto es un scan de toda la tabla.
        Index("ix_auditoria_entidad", "entidad_tipo", "entidad_id"),
    )
