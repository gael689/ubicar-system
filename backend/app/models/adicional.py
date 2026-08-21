from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    String, Text, DateTime, Boolean, Integer, Numeric, ForeignKey,
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Adicional(Base):
    """
    Servicio o cobertura que se suma a un alquiler (Fase 5, ítem 56 — plan §7.4).

    **Los cargan los dueños con su precio**, no son una lista fija en el
    código: la lista todavía no está cerrada y va a cambiar con la temporada.
    Por eso es una entidad con ABM y no un enum.

    Dos grupos, con reglas de selección distintas (plan §7.4, paso 2):

    - `cobertura`: **se elige UNA sola**. Básica / intermedia / full. Es
      excluyente porque son niveles del mismo seguro, no complementos.
    - `extra`: **se eligen las que se quiera**. Cadenas, lona para perros,
      silla de bebé, GPS, portaequipaje.

    La exclusividad vive en el grupo y no en una columna por fila para que no
    se pueda cargar mal: dos coberturas marcadas como no-excluyentes serían
    un estado imposible de interpretar al cobrar.
    """
    __tablename__ = "adicionales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    codigo: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)

    grupo: Mapped[str] = mapped_column(
        SAEnum("cobertura", "extra", name="grupo_adicional"),
        nullable=False,
        default="extra",
        index=True,
    )

    precio: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    unidad_cobro: Mapped[str] = mapped_column(
        SAEnum("por_dia", "unico", name="unidad_cobro_adicional"),
        nullable=False,
        default="por_dia",
    )

    # Cobertura incluida en el precio del alquiler: se ofrece preseleccionada y
    # normalmente con precio 0. Sin esto no habría forma de expresar "la
    # básica ya viene", que es el punto de partida del paso 2 del flujo web.
    incluido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Sólo para coberturas: **cuánto BAJA la franquicia**, no cuánto queda
    # (migración 084).
    #
    # Guardaba el resultado ya calculado, y eso sólo puede ser cierto para una
    # categoría: hay seis con tres bases distintas ($1,5M / $2M / $3M). Con un
    # absoluto compartido, el mismo "+10%" le bajaba $1.000.000 a un Compacto y
    # $2.500.000 a una SUV — el mismo precio comprando beneficios distintos, y
    # nadie lo veía porque lo que se mostraba era el resultado.
    #
    # La franquicia que ve el cliente se calcula contra la base de **su**
    # categoría: ver `domain/franquicia.py::franquicia_resultante`.
    franquicia_descuento: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Plan de conexión (13/08), D-53: las coberturas que bajan la franquicia
    # se cobran como **porcentaje del alquiler del vehículo**, no como un
    # monto fijo por día — "un 30% más" no tiene el mismo sentido en un
    # Compacto de 3 días que en una Pick-up de 20. Cuando está cargado,
    # reemplaza a `precio`/`unidad_cobro` para esta línea; `PrecioService` lo
    # resuelve contra `subtotal_vehiculo` una vez que ese número existe.
    porcentaje_sobre_alquiler: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Tope de unidades por reserva (2 sillas de bebé, 1 GPS). NULL = sin tope.
    max_cantidad: Mapped[int | None] = mapped_column(Integer, nullable=True)

    visible_web: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class ReservaAdicional(Base):
    """
    Un adicional contratado en una reserva puntual.

    **El precio se congela acá al contratarlo.** Si mañana suben el precio de
    la cobertura full, las reservas ya cargadas siguen valiendo lo que se
    pactó — mismo criterio que `Reserva.precio_lista`. Sin esto, cambiar un
    precio reescribiría el pasado y ninguna reserva vieja cerraría contra lo
    que el cliente firmó.
    """
    __tablename__ = "reserva_adicionales"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reserva_id: Mapped[int] = mapped_column(
        ForeignKey("reservas.id"), nullable=False, index=True
    )
    adicional_id: Mapped[int] = mapped_column(
        ForeignKey("adicionales.id"), nullable=False, index=True
    )
    cantidad: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Congelados al momento de contratar (ver docstring).
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unidad_cobro: Mapped[str] = mapped_column(
        SAEnum("por_dia", "unico", name="unidad_cobro_adicional", create_type=False),
        nullable=False,
    )
    # Total ya resuelto (precio × cantidad × días si es por día). Se guarda
    # calculado porque la duración de la reserva puede cambiar después con una
    # extensión, y lo que se cobró no debe moverse solo.
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    adicional: Mapped["Adicional"] = relationship("Adicional", lazy="joined")

    # El nombre y el grupo se leen del catálogo, no se copian: si le corrigen
    # una falta de ortografía al nombre, la reserva vieja también la corrige.
    # Sólo el PRECIO se congela — es lo único que cambia lo que se cobra.
    @property
    def nombre(self) -> str | None:
        return self.adicional.nombre if self.adicional else None

    @property
    def grupo(self) -> str | None:
        return self.adicional.grupo if self.adicional else None
