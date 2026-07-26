"""
Dependencias inyectables de FastAPI.

En ENVIRONMENT=development la autenticación está bypasseada:
get_current_user devuelve un usuario admin mock sin validar ningún token.
Esto permite desarrollar y testear todos los endpoints sin Clerk/Auth0.

Cuando se integre Clerk, solo hay que cambiar este archivo.
"""
import logging
from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.config import settings
from app.models.usuario import Usuario
from app.adapters.storage import IStorage, LocalStorage

logger = logging.getLogger(__name__)

# Esquema de seguridad — opcional en dev para no romper el swagger
_security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    """Provee una sesión de base de datos por request.
    Commit automático al final del request exitoso; rollback en caso de error.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _upsert_dev_admin(db: Session) -> Usuario:
    """Devuelve el admin de bypass desde DB, creándolo si no existe."""
    user = db.query(Usuario).filter(Usuario.auth_sub == settings.dev_admin_auth_sub).first()
    if user is not None:
        return user
    user = Usuario(
        email=settings.dev_admin_email,
        nombre=settings.dev_admin_nombre,
        rol="admin",
        auth_sub=settings.dev_admin_auth_sub,
        activo=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    Retorna el usuario autenticado.

    - Si dev_bypass_auth=true: hace upsert del admin de bypass y lo devuelve.
    - Si no: validará JWT de Clerk (a implementar en Fase Clerk).
    """
    if settings.dev_bypass_auth:
        return _upsert_dev_admin(db)

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticación requerido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Autenticación con Clerk pendiente de implementar",
    )


def require_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Requiere que el usuario tenga rol admin."""
    if current_user.rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol admin para esta acción",
        )
    return current_user


# Cacheado: una sola instancia por proceso. LocalStorage es thread-safe (filesystem ops).
_storage_singleton: IStorage | None = None


def get_storage() -> IStorage:
    """Devuelve el adapter de storage configurado. Hoy solo LocalStorage."""
    global _storage_singleton
    if _storage_singleton is None:
        if settings.storage_provider != "local":
            raise RuntimeError(
                f"storage_provider='{settings.storage_provider}' no soportado todavía. "
                "Solo 'local' está implementado. Ver memoria storage-local-first."
            )
        _storage_singleton = LocalStorage(base_path=settings.storage_path)
    return _storage_singleton
