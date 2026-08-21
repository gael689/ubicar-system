from datetime import datetime, date
from sqlalchemy import String, Boolean, DateTime, Date, Enum, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# D-53 (plan de conexión, §4.3 punto 1) — el `dni_cuit` reservado del cliente
# genérico que sostiene las solicitudes sin cupo (`POST /public/solicitudes`)
# cuando quien pregunta todavía no es cliente. Antes se usaba
# `order_by(Cliente.id).first()`, que devuelve 503 apenas la base de clientes
# queda vacía — exactamente lo que pasa después de una limpieza.
DNI_CLIENTE_GENERICO = "00000000"
NOMBRE_CLIENTE_GENERICO = "Consultas web"


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

    # ── De dónde vino (migración 077) ────────────────────────────────────────
    # Mismo vocabulario que `Reserva.origen`: son el mismo concepto. Sin esto,
    # alguien que se registró solo desde el sitio se veía en su ficha igual que
    # uno cargado a mano, y no había forma de contestar cuántos clientes trajo
    # la web.
    origen: Mapped[str] = mapped_column(
        String(20), server_default="mostrador", default="mostrador",
        nullable=False, index=True,
    )
    # **Nulo cuando vino de la web**, a propósito: el alta web la ejecuta el
    # usuario "Sistema", y ese nombre en la ficha no le dice nada a nadie. Que
    # entró solo ya lo dice `origen`.
    creado_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    creado_por_usuario: Mapped["Usuario | None"] = relationship("Usuario")

    @property
    def creado_por_nombre(self) -> str | None:
        """Quién lo dio de alta, para mostrarlo al lado del canal."""
        u = self.creado_por_usuario
        return getattr(u, "nombre", None) if u else None

    # Datos fiscales (Fase 1, sección 3.7). razon_social/condicion_iva
    # aplican sobre todo a tipo='empresa'; fecha_nacimiento a particular
    # (edad mínima de conductor). Todos nullable porque muchos clientes
    # ya cargados no los van a tener.
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    condicion_iva: Mapped[str | None] = mapped_column(
        Enum("responsable_inscripto", "monotributo", "consumidor_final", "exento", name="condicion_iva"),
        nullable=True,
    )
    domicilio: Mapped[str | None] = mapped_column(String(255), nullable=True)
    localidad: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provincia: Mapped[str | None] = mapped_column(String(100), nullable=True)
    codigo_postal: Mapped[str | None] = mapped_column(String(10), nullable=True)
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date(), nullable=True)
    licencia_pais: Mapped[str | None] = mapped_column(String(100), nullable=True)
    licencia_desde: Mapped[date | None] = mapped_column(Date(), nullable=True)
    # Reutiliza los mismos valores que CuentaCorriente.condicion_pago.
    condicion_pago_default: Mapped[str | None] = mapped_column(String(20), nullable=True)

    conductores_adicionales: Mapped[list["ConductorAdicional"]] = relationship(
        back_populates="cliente", cascade="all, delete-orphan"
    )
    contactos: Mapped[list["ClienteContacto"]] = relationship(
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
    # Quien maneja puede no ser quien paga: si la reserva designa un conductor
    # adicional, la edad y la licencia que valen son las suyas. Ya no cambia el
    # precio (se retiró el recargo por franja etaria, D-38); sigue decidiendo
    # la edad mínima para alquilar (D-51).
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date(), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    cliente: Mapped["Cliente"] = relationship(back_populates="conductores_adicionales")


class ClienteContacto(Base):
    """Contacto de una empresa cliente (puede haber varios, cada uno con su puesto)."""
    __tablename__ = "cliente_contactos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    puesto: Mapped[str | None] = mapped_column(String(100), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    cliente: Mapped["Cliente"] = relationship(back_populates="contactos")
