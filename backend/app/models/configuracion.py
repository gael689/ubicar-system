from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Configuracion(Base):
    """
    Parámetro de negocio editable desde la pantalla de Configuración
    (Fase 3, ítem 40). Clave/valor genérico en vez de columnas fijas para
    poder agregar nuevos parámetros sin migración. No es un ledger — no
    aplica la regla de "nunca eliminar" con historial (ver
    [[regla-nunca-eliminar]]): esto es configuración de aplicación, no un
    registro de negocio.
    """
    __tablename__ = "configuracion"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    clave: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    valor: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # int | decimal | bool | string
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    updated_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
