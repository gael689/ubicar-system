from datetime import datetime, date
from typing import TYPE_CHECKING, List
from sqlalchemy import String, Boolean, Date, DateTime, Enum, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.servicio import Servicio


class Vehiculo(Base):
    __tablename__ = "vehiculos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    patente: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    marca: Mapped[str] = mapped_column(String(100), nullable=False)
    modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    anio: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo: Mapped[str] = mapped_column(
        Enum("auto", "camioneta", name="tipo_vehiculo"), nullable=False
    )
    color: Mapped[str] = mapped_column(String(50), nullable=False)
    estado: Mapped[str] = mapped_column(
        Enum(
            "disponible", "alquilado", "reservado", "en_transicion", "fuera_de_servicio",
            name="estado_vehiculo",
        ),
        nullable=False,
        default="disponible",
    )
    # Categoría (D-08): compacto/sedán/sedán superior/SUV/pick-up/furgón.
    # Nullable: los 16 vehículos ya cargados antes de esto se categorizan a mano.
    categoria_id: Mapped[int | None] = mapped_column(ForeignKey("categorias.id"), nullable=True)

    # A qué está afectado el vehículo (migración 086).
    #
    # **`alquiler` es lo que se vende; `uber` es flota que no se alquila.** Un
    # auto afectado a Uber sigue acá con sus vencimientos, sus services y sus
    # gastos —darlo de baja con `activo = false` para sacarlo del cupo se
    # llevaría todo eso—, pero queda fuera de `DisponibilidadService`, y por lo
    # tanto de la web, del cupo interno y del paso 3 del wizard.
    #
    # No es una `Categoria` porque un auto de Uber sigue siendo una Pick-up:
    # lo que cambia es a qué está afectado, no qué es.
    destino: Mapped[str] = mapped_column(
        String(20), nullable=False, default="alquiler", server_default="alquiler"
    )
    km_actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    km_proximo_service: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    km_entre_services: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    foto_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    # Cuándo entró al estado actual (Fase 2: regla "fuera de servicio > 7
    # días" la necesita). Se actualiza cada vez que cambia `estado`.
    estado_desde: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Vencimientos (Fase 3, ítem 38): campos propios del vehículo, no
    # dependen de que alguien haya subido el Documento correcto con
    # vigencia_hasta cargada. El Documento (tipo='vtv'/'poliza') sigue
    # existiendo para el archivo adjunto — esto es la fecha que el sistema
    # usa para alertar y filtrar.
    vtv_vencimiento: Mapped[date | None] = mapped_column(Date(), nullable=True)
    poliza_vencimiento: Mapped[date | None] = mapped_column(Date(), nullable=True)
    compania_seguro: Mapped[str | None] = mapped_column(String(150), nullable=True)
    nro_poliza: Mapped[str | None] = mapped_column(String(50), nullable=True)

    servicios: Mapped[List["Servicio"]] = relationship("Servicio", back_populates="vehiculo", order_by="Servicio.fecha.desc()")
    categoria: Mapped["Categoria"] = relationship("Categoria")
