from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class TarjetaCliente(Base):
    __tablename__ = "tarjetas_cliente"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, unique=True, index=True)
    nombre_completo: Mapped[str] = mapped_column(String(255), nullable=False)
    nro_tarjeta: Mapped[str] = mapped_column(String(19), nullable=False)
    vencimiento: Mapped[str] = mapped_column(String(7), nullable=False)
    codigo_3_digitos: Mapped[str] = mapped_column(String(3), nullable=False)
    dni_titular: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    cliente: Mapped["Cliente"] = relationship("Cliente")
