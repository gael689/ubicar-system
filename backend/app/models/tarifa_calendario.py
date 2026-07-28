from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    String, Text, Date, DateTime, Boolean, Integer, Numeric, ForeignKey, JSON,
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TarifaCalendario(Base):
    """
    Regla de precio por día del calendario (Fase 5, ítem 57 — plan §7.2).

    Es la forma en que los dueños dijeron que quieren cargar los precios:
    un precio base anual, precios fijos para las fechas que mueven la aguja
    (Navidad, Día del Amigo) y promociones encima para incentivar el
    marketing. Las tres capas son la misma tabla con distinta `prioridad`:

        prioridad  0  → precio base anual de la categoría
        prioridad 10  → fecha especial / temporada
        prioridad 20  → promoción (`es_promocional`)

    **La regla de mayor prioridad que cubre el día gana, sin borrar nada.**
    Esa es la propiedad importante: cargar la promo de Navidad no destruye
    el precio base, y cuando la promo se da de baja el precio de abajo
    vuelve a aplicar solo.

    El desempate está definido en `domain/precios.py::resolver_regla_dia`
    y es deliberadamente predecible: prioridad → especificidad (vehículo
    puntual > categoría > general) → rango más corto → id más alto.

    `fecha_especial_id` es el "acoplar todo a esto" que se pidió: en vez de
    repetir a mano el rango de Navidad, la regla apunta a la fecha especial
    y hereda su rango. Así "Navidad 2026" se define UNA vez y sirve para el
    calendario de ocupación y para el precio.
    """
    __tablename__ = "tarifas_calendario"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)

    # A qué se aplica. Los tres NULL = regla general (toda la flota).
    categoria_id: Mapped[int | None] = mapped_column(
        ForeignKey("categorias.id"), nullable=True, index=True
    )
    vehiculo_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehiculos.id"), nullable=True, index=True
    )

    # Cuándo aplica. O bien el rango explícito, o bien heredado de una fecha
    # especial (mutuamente excluyente, validado en el schema).
    fecha_especial_id: Mapped[int | None] = mapped_column(
        ForeignKey("fechas_especiales.id"), nullable=True, index=True
    )
    fecha_desde: Mapped[date | None] = mapped_column(Date(), nullable=True, index=True)
    fecha_hasta: Mapped[date | None] = mapped_column(Date(), nullable=True, index=True)

    # Días de la semana a los que se limita, en formato ISO (1=lunes .. 7=domingo).
    # NULL = todos. Es lo que permite "los fines de semana valen más".
    dias_semana: Mapped[list | None] = mapped_column(JSON, nullable=True)

    precio_dia: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    prioridad: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)

    # Restricciones de duración del alquiler (no del rango de fechas).
    min_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Permite precio distinto en la web que en el mostrador. Es más expresivo
    # que el `visible_web` booleano del plan: cubre los dos casos (ocultar de
    # la web) y además el de una promo que existe SÓLO online.
    canal: Mapped[str] = mapped_column(
        SAEnum("ambos", "web", "mostrador", name="canal_tarifa_calendario"),
        nullable=False,
        default="ambos",
    )

    # Una promo no es sólo un precio más barato: es un precio que se COMUNICA
    # como descuento. Sin estos campos la web muestra algo más barato y el
    # cliente nunca se entera de que está aprovechando una promo — lo
    # contrario de "incentivar el marketing".
    es_promocional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    precio_referencia: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    etiqueta_promo: Mapped[str | None] = mapped_column(String(80), nullable=True)

    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class DescuentoDuracion(Base):
    """
    Descuento por alquilar muchos días (plan §7.2), aplicado sobre el
    subtotal de la suma día por día.

    Es un eje distinto al de `TarifaCalendario`: ésta dice cuánto vale CADA
    día, y el descuento por duración dice cuánto se bonifica por el largo
    total. Mantenerlos separados evita tener que cargar una regla de
    calendario por cada combinación de fecha × duración.

    `dias_hasta` NULL = sin tope ("30 días o más").
    `categoria_id` NULL = aplica a toda la flota.
    """
    __tablename__ = "descuentos_duracion"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    categoria_id: Mapped[int | None] = mapped_column(
        ForeignKey("categorias.id"), nullable=True, index=True
    )
    dias_desde: Mapped[int] = mapped_column(Integer, nullable=False)
    dias_hasta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
