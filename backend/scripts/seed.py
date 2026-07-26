"""
Seed idempotente de usuarios admin.

Inserta el admin de bypass (DEV_ADMIN_*) y cualquier sub adicional listado en
CLERK_ADMIN_SUBS (separados por coma). Si el usuario ya existe por auth_sub,
no hace nada.

Uso:
    docker compose exec backend python -m scripts.seed
"""
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.usuario import Usuario


def _upsert(db: Session, *, auth_sub: str, email: str, nombre: str, rol: str = "admin") -> bool:
    existing = db.query(Usuario).filter(Usuario.auth_sub == auth_sub).first()
    if existing is not None:
        return False
    db.add(Usuario(auth_sub=auth_sub, email=email, nombre=nombre, rol=rol, activo=True))
    return True


def main() -> None:
    db = SessionLocal()
    try:
        created = 0

        if _upsert(
            db,
            auth_sub=settings.dev_admin_auth_sub,
            email=settings.dev_admin_email,
            nombre=settings.dev_admin_nombre,
        ):
            created += 1
            print(f"  + admin bypass: {settings.dev_admin_email}")

        for raw in (settings.clerk_admin_subs or "").split(","):
            sub = raw.strip()
            if not sub:
                continue
            if _upsert(db, auth_sub=sub, email=f"{sub}@pending.invalid", nombre=sub):
                created += 1
                print(f"  + clerk admin: {sub}")

        db.commit()
        print(f"Seed completo. Usuarios nuevos: {created}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
