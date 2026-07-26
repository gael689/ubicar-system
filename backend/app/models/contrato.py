from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Contrato(Base):
    __tablename__ = "contratos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    alquiler_id: Mapped[int] = mapped_column(
        ForeignKey("alquileres.id"), nullable=False, unique=True, index=True
    )
    url_pdf: Mapped[str | None] = mapped_column(String(512), nullable=True)
    firmado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_generacion: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    datos_prellenados: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    link_prellenado: Mapped[str | None] = mapped_column(String(512), nullable=True)
    link_expiracion: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    alquiler: Mapped["Alquiler"] = relationship("Alquiler", back_populates="contrato")
