from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

# D-53 (plan de conexión, §4.3 punto 2) — el `auth_sub` del usuario "Sistema"
# que representa acciones que no cargó una persona (reservas web, solicitudes
# sin cupo). Antes esos lugares usaban `order_by(Usuario.id).first()`, que
# funcionaba sólo porque ese primer usuario resultaba ser de prueba — después
# de una limpieza de datos pasa a ser una persona real, y la auditoría
# empieza a decir que Franco cargó algo que entró solo por la web a las 3 de
# la mañana. Nunca es un Clerk `sub` real (esos vienen con el prefijo
# `user_`), así que no puede colisionar.
AUTH_SUB_SISTEMA = "sistema:interno"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[str] = mapped_column(
        Enum("admin", "docs", name="rol_usuario"), nullable=False, default="admin"
    )
    # auth_sub: identificador del proveedor de auth (Clerk sub, Auth0 sub, etc.)
    auth_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
