from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    String, Text, Date, DateTime, Numeric, Boolean, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Danio(Base):
    """
    Daño registrado sobre un vehículo (Fase 4, ítems 52-53).

    El daño le pertenece al **vehículo**, no al alquiler: por eso `vehiculo_id`
    es obligatorio y `alquiler_id` es opcional. Un daño puede nacer:
      - en un check-out (`momento="checkout"`): ya estaba antes de entregar,
      - en un check-in (`momento="checkin"`): apareció durante el alquiler,
      - fuera de un alquiler (`momento="preexistente"`, `alquiler_id=None`):
        cargado a mano sobre la ficha del vehículo.

    Los daños con `estado != "reparado"` son los que se precargan como
    "preexistentes" en el próximo check-out — así el operador ve lo que ya
    estaba y no se lo imputa al cliente equivocado.

    Nunca se elimina (regla de oro del proyecto): `activo=False` da de baja.
    """
    __tablename__ = "danios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehiculo_id: Mapped[int] = mapped_column(ForeignKey("vehiculos.id"), nullable=False, index=True)
    alquiler_id: Mapped[int | None] = mapped_column(ForeignKey("alquileres.id"), nullable=True, index=True)
    # Cliente al que se le atribuye el daño. Se completa sólo cuando el daño
    # se detecta en un check-in y el operador decide que es responsabilidad
    # suya — no se deduce solo (ver `responsable`).
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True, index=True)

    momento: Mapped[str] = mapped_column(
        SAEnum("checkout", "checkin", "preexistente", name="momento_danio"),
        nullable=False,
    )
    # Zona del vehículo. Texto acotado en vez de enum rígido: la lista real la
    # define el frontend (paragolpes delantero, puerta trasera izq., etc.) y
    # conviene poder sumar zonas sin migración.
    zona: Mapped[str] = mapped_column(String(80), nullable=False)
    tipo: Mapped[str] = mapped_column(
        SAEnum(
            "rayon", "abolladura", "rotura", "faltante",
            "cristal", "tapizado", "mecanico", "otro",
            name="tipo_danio",
        ),
        nullable=False,
    )
    severidad: Mapped[str] = mapped_column(
        SAEnum("leve", "moderado", "grave", name="severidad_danio"),
        nullable=False,
        default="leve",
    )
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha_deteccion: Mapped[date] = mapped_column(Date(), nullable=False, default=date.today)

    # ── Valorización (ítem 53) ────────────────────────────────────────────────
    # `costo_estimado` es lo que se calcula que cuesta repararlo.
    # `monto_imputado` es lo que efectivamente se le cobró al cliente — puede
    # ser menor (bonificación parcial) o cero. Se separan a propósito: el costo
    # es un dato del taller, la imputación es una decisión comercial.
    costo_estimado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    monto_imputado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    responsable: Mapped[str] = mapped_column(
        SAEnum("sin_definir", "cliente", "desgaste", "terceros", name="responsable_danio"),
        nullable=False,
        default="sin_definir",
    )
    estado: Mapped[str] = mapped_column(
        SAEnum("detectado", "valorizado", "imputado", "reparado", "bonificado", name="estado_danio"),
        nullable=False,
        default="detectado",
    )
    # Movimiento de cuenta corriente generado al imputar. Permite revertirlo
    # con un contra-asiento si después se bonifica (mismo patrón que multas).
    movimiento_cc_id: Mapped[int | None] = mapped_column(
        ForeignKey("movimientos_cuenta_corriente.id"), nullable=True
    )
    motivo_bonificacion: Mapped[str | None] = mapped_column(Text, nullable=True)

    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    registrado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    fotos: Mapped[list["FotoDanio"]] = relationship(
        "FotoDanio", back_populates="danio", cascade="all, delete-orphan"
    )
    vehiculo: Mapped["Vehiculo"] = relationship("Vehiculo", foreign_keys=[vehiculo_id])
    cliente: Mapped["Cliente"] = relationship("Cliente", foreign_keys=[cliente_id])


class FotoDanio(Base):
    """
    Foto de un daño. Guarda sólo la `archivo_key` de `IStorage` — el mismo
    mecanismo que ya usan Documentos y Comprobantes, así que sirve igual con
    almacenamiento local hoy y con R2 el día que se migre.
    """
    __tablename__ = "fotos_danio"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    danio_id: Mapped[int] = mapped_column(ForeignKey("danios.id"), nullable=False, index=True)
    archivo_key: Mapped[str] = mapped_column(String(512), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subida_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    danio: Mapped["Danio"] = relationship("Danio", back_populates="fotos")
