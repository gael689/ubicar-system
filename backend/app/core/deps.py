"""
Dependencias inyectables de FastAPI.

Con `DEV_BYPASS_AUTH=true` la autenticación está bypasseada: `get_current_user`
devuelve un admin upserteado en DB sin validar ningún token, que es lo que
permite desarrollar y correr los tests sin depender de Clerk.

Con `false` se valida el JWT de Clerk de verdad: firma contra el JWKS de la
instancia, expiración, y upsert del usuario local a partir del `sub`.
"""
import logging
import time
from typing import Any, Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.config import settings
from app.models.usuario import Usuario
from app.adapters.storage import IStorage, LocalStorage, S3Storage

logger = logging.getLogger(__name__)

# Esquema de seguridad — opcional en dev para no romper el swagger
_security = HTTPBearer(auto_error=False)

# ─── JWKS de Clerk ───────────────────────────────────────────────────────────
# Las claves públicas se cachean: son estables y bajarlas en cada request
# agregaría una llamada de red a **todos** los endpoints del sistema. El TTL
# existe porque Clerk las rota, y una clave rotada tiene que poder entrar sin
# reiniciar el proceso.
_JWKS_TTL_SEGUNDOS = 3600
_jwks_cache: dict[str, Any] = {"claves": None, "vence_en": 0.0}


def _jwks(forzar: bool = False) -> dict:
    if not settings.clerk_jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLERK_JWKS_URL no está configurada",
        )
    ahora = time.time()
    if not forzar and _jwks_cache["claves"] and _jwks_cache["vence_en"] > ahora:
        return _jwks_cache["claves"]

    import urllib.request
    import json

    with urllib.request.urlopen(settings.clerk_jwks_url, timeout=10) as r:
        claves = json.load(r)
    _jwks_cache["claves"] = claves
    _jwks_cache["vence_en"] = ahora + _JWKS_TTL_SEGUNDOS
    return claves


def _decodificar(token: str) -> dict:
    """
    Valida firma y expiración del JWT de Clerk.

    Si el `kid` no aparece en el JWKS cacheado se refresca **una vez** antes de
    rechazar: es exactamente lo que pasa el día que Clerk rota las claves, y
    sin ese reintento el sistema entero se cae hasta que alguien lo reinicie.
    """
    from jose import jwt
    from jose.exceptions import JWTError

    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token malformado")

    def buscar(claves: dict) -> dict | None:
        return next((k for k in claves.get("keys", []) if k.get("kid") == kid), None)

    clave = buscar(_jwks())
    if clave is None:
        clave = buscar(_jwks(forzar=True))
    if clave is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token con clave desconocida")

    try:
        # `audience` no se verifica: los tokens de sesión de Clerk no traen
        # `aud` por defecto. La garantía viene de la firma contra el JWKS de
        # **nuestra** instancia, que es lo que nadie más puede falsificar.
        return jwt.decode(
            token, clave, algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except JWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Token inválido: {e}")


def _usuario_desde_clerk(db: Session, claims: dict) -> Usuario:
    """
    Trae el usuario local que corresponde al `sub` de Clerk.

    **Tener sesión en Clerk NO alcanza para entrar al sistema.** Una instancia
    de Clerk acepta registro público por defecto, y su portal hospedado queda
    accesible aunque el frontend sólo muestre el formulario de ingreso. Si acá
    se creara el usuario automáticamente, cualquiera que se registre con un
    mail cualquiera obtendría un token válido y con él la ficha completa de
    todos los clientes: DNI, licencias, documentos escaneados y cuentas
    corrientes. **El alta la hace el sistema, no el proveedor de identidad.**

    Sólo se auto-provisionan los `sub` listados en `CLERK_ADMIN_SUBS`, que es
    el arranque en frío: sin eso no habría forma de crear el primer admin.
    """
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sin `sub`")

    usuario = db.query(Usuario).filter(Usuario.auth_sub == sub).first()
    if usuario is not None:
        if not usuario.activo:
            # Dar de baja a alguien tiene que cortarle el acceso aunque su
            # sesión de Clerk siga viva.
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuario dado de baja")
        return usuario

    admins = {s.strip() for s in (settings.clerk_admin_subs or "").split(",") if s.strip()}
    if sub not in admins:
        logger.warning("[Clerk] identidad sin usuario en el sistema: sub=%s", sub)
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tu cuenta todavía no tiene acceso al sistema. Pedile a un "
            "administrador que te dé de alta.",
        )

    email = claims.get("email") or f"{sub}@sin-email.clerk"
    nombre = (
        claims.get("name")
        or " ".join(filter(None, [claims.get("first_name"), claims.get("last_name")])).strip()
        or email.split("@")[0]
    )
    usuario = Usuario(
        email=email, nombre=nombre, rol="admin", auth_sub=sub, activo=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    logger.info("[Clerk] admin inicial dado de alta: %s (%s)", nombre, email)
    return usuario


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

    - Con `dev_bypass_auth=true`: upsert del admin de bypass, sin validar nada.
    - Con `false`: valida el JWT de Clerk contra el JWKS de la instancia.
    """
    if settings.dev_bypass_auth:
        # El bypass en producción convertiría a cualquiera en admin sin token.
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DEV_BYPASS_AUTH está activo en producción",
            )
        return _upsert_dev_admin(db)

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticación requerido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _usuario_desde_clerk(db, _decodificar(credentials.credentials))


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
    """
    El adapter de storage según la configuración.

    - `local` — disco. Es lo correcto en desarrollo y en un servidor con volumen
      persistente.
    - `r2` / `s3` — bucket compatible con S3. **Es lo que hay que usar en un
      hosting serverless**, donde el disco es efímero y los archivos subidos
      desaparecen.

    Los módulos de negocio no saben cuál está activo: hablan con `IStorage`.
    """
    global _storage_singleton
    if _storage_singleton is None:
        proveedor = (settings.storage_provider or "local").lower()

        if proveedor == "local":
            _storage_singleton = LocalStorage(base_path=settings.storage_path)
        elif proveedor in ("r2", "s3"):
            _storage_singleton = S3Storage(
                bucket=settings.storage_bucket,
                access_key_id=settings.storage_access_key_id,
                secret_access_key=settings.storage_secret_access_key,
                endpoint_url=settings.storage_endpoint_url,
                public_base_url=settings.storage_public_base_url,
            )
        else:
            raise RuntimeError(
                f"storage_provider='{proveedor}' desconocido. "
                "Valores válidos: 'local', 'r2', 's3'."
            )
    return _storage_singleton
