from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from app.config import settings

# El pool se configura según dónde corre el proceso.
#
# **En un contenedor de larga vida** (Railway, Docker) el pool es lo correcto:
# un proceso, conexiones reutilizadas, sin pagar el handshake en cada request.
#
# **En serverless** (Vercel) hay que desactivarlo. Cada instancia abre su
# propio pool, así que diez requests en paralelo pueden pedir 300 conexiones y
# Postgres las rechaza. Con `NullPool` cada request abre y cierra la suya, y
# el pooling lo hace el proveedor de la base.
if settings.db_sin_pool:
    engine = create_engine(settings.database_url, poolclass=NullPool, pool_pre_ping=True)
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
