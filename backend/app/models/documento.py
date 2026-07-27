from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, ForeignKey, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int | None] = mapped_column(ForeignKey("vehiculos.id"), nullable=True, index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)
    tipo: Mapped[str] = mapped_column(
        Enum(
            "poliza", "vtv", "clausulas", "otro", "dni", "licencia", "contrato", "reserva",
            name="tipo_documento",
        ),
        nullable=False,
    )
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    archivo_key: Mapped[str] = mapped_column(String(512), nullable=False)
    fecha_carga: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    vigencia_desde: Mapped[date | None] = mapped_column(Date(), nullable=True)
    vigencia_hasta: Mapped[date | None] = mapped_column(Date(), nullable=True, index=True)
    cargado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)

    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo", foreign_keys=[vehiculo_id])
    cliente: Mapped["Cliente"] = relationship("Cliente", foreign_keys=[cliente_id])
