from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, event, select,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.pago import Pago


class Socio(Base):
    """
    Una persona que cobra plata para la empresa (Franco, Martín, Ramiro).

    `porcentaje` es lo que le corresponde del total cobrado (50 y 50 hoy). Quien
    cobra pero **no es socio** —Ramiro— tiene porcentaje 0: su plata aparece en
    la caja del mes como "en sus manos" y se le pasa a los socios al compensar.
    `usuario_id` vincula al socio con su usuario del sistema: los cobros que
    registre ese usuario quedan a su nombre solos.
    """
    __tablename__ = "socios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80), nullable=False)
    porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0, server_default="0")
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, unique=True)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Reparto(Base):
    """
    El cierre de un mes: se compensó lo cobrado entre los socios.

    Marca como *repartidos* los cobros del mes (`pagos.reparto_id`) y guarda
    cómo quedó la cuenta. **No se borra**: se anula, y al anular los cobros
    vuelven a quedar sin repartir.
    """
    __tablename__ = "repartos"

    id: Mapped[int] = mapped_column(primary_key=True)
    mes: Mapped[date] = mapped_column(Date, nullable=False, index=True)  # primer día del mes
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    total_cobrado: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    distribuible: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    # Cómo quedó: [{de, a, monto}] y {socio_id: porcentaje} vigentes al repartir.
    transferencias: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    porcentajes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    anulado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false", index=True)
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class MovimientoPropio(Base):
    """
    La cuenta **propia** de un usuario: lo que anota para su otro negocio.

    Franco tiene su propio negocio y quiere llevarlo en el mismo sistema, sin
    que lo vean los demás. **Todo lo de alquileres es compartido, siempre**;
    esto es un registro aparte que cada usuario anota a propósito, y que ninguna
    consulta devuelve a otro usuario (se filtra por `usuario_id` en el backend,
    no sólo en la pantalla). Tampoco entra en ningún total de la empresa.
    """
    __tablename__ = "movimientos_propios"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    concepto: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(String(8), nullable=False)  # entra | sale
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    medio: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    anulado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


@event.listens_for(Pago, "before_insert")
def _pago_a_nombre_del_socio(mapper, connection, pago: Pago) -> None:
    """
    Un cobro nuevo queda a nombre del socio vinculado al usuario que lo cargó.

    Va como evento y no en cada lugar que crea un `Pago` (hay ocho: seña, check-out,
    recibo, daños, multas, pago web…) porque olvidarse en uno solo deja plata sin
    dueño en la caja del mes. Si el usuario no es un socio, queda sin asignar y
    el mes lo muestra para asignarlo.
    """
    if getattr(pago, "socio_id", None) is not None or not pago.cobrado_por:
        return
    pago.socio_id = connection.execute(
        select(Socio.id).where(Socio.usuario_id == pago.cobrado_por, Socio.activo.is_(True))
    ).scalar()
