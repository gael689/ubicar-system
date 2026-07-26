from datetime import datetime, date
from sqlalchemy import String, Boolean, DateTime, Date, Enum, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre_completo: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    dni_cuit: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    telefono: Mapped[str] = mapped_column(String(30), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    licencia_numero: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Nullable: el formulario de alta de cliente trata la licencia como opcional
    # (empresas sin conductor asignado todavía, por ejemplo). Ver CLI-11 en
    # docs/CASOS_DE_USO.md para la decisión pendiente de si debería ser obligatoria.
    licencia_vencimiento: Mapped[date | None] = mapped_column(Date(), nullable=True)
    licencia_categoria: Mapped[str | None] = mapped_column(String(5), nullable=True)
    tipo: Mapped[str] = mapped_column(
        Enum("particular", "empresa", name="tipo_cliente"), nullable=False, default="particular"
    )
    es_frecuente: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    conductores_adicionales: Mapped[list["ConductorAdicional"]] = relationship(
        back_populates="cliente", cascade="all, delete-orphan"
    )


class ConductorAdicional(Base):
    __tablename__ = "conductores_adicionales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    nombre_completo: Mapped[str] = mapped_column(String(255), nullable=False)
    dni: Mapped[str | None] = mapped_column(String(20), nullable=True)
    licencia_numero: Mapped[str | None] = mapped_column(String(50), nullable=True)
    licencia_vencimiento: Mapped[date] = mapped_column(Date(), nullable=False)

    cliente: Mapped["Cliente"] = relationship(back_populates="conductores_adicionales")
