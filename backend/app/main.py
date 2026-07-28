import logging
from contextlib import asynccontextmanager
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal
from app.core.exceptions import NotFoundError, ConflictError, BusinessRuleError, UnauthorizedError
from app.routers import (
    vehiculos, clientes, reservas, alquileres,
    contratos, pagos, gastos, echeqs, documentos,
    cotizador, reportes, public, tarifas, ocupacion, tarjetas, multas,
    servicios, notificaciones, cuentas_corrientes, recibos, categorias,
    comprobantes, configuracion, busqueda, danios, fechas_especiales,
    precios, adicionales, bloqueos,
)

logger = logging.getLogger(__name__)

TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")


def _correr_motor_notificaciones() -> None:
    """Job del scheduler (08:00 ART): corre todas las reglas del catálogo
    (domain/notificaciones_reglas.py), persiste lo nuevo, auto-resuelve lo
    que ya no aplica, y manda el digest matutino por email (último canal,
    no-op si no hay destinatarios/API key configurados). Ver
    app/services/notificacion_service.py."""
    from app.services.notificacion_service import NotificacionService

    db = SessionLocal()
    try:
        service = NotificacionService(db)
        resultado = service.generar()
        db.commit()
        logger.info(
            "[Scheduler] Motor de notificaciones: %s creadas, %s resueltas, %s evaluadas",
            resultado["creadas"], resultado["resueltas"], resultado["evaluadas"],
        )
        enviados = service.enviar_digest_matutino()
        if enviados:
            logger.info("[Scheduler] Digest matutino enviado a %s destinatarios", enviados)
    except Exception:
        db.rollback()
        logger.exception("[Scheduler] Falló la corrida del motor de notificaciones")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = AsyncIOScheduler(timezone=TZ_ARGENTINA)
    scheduler.add_job(
        _correr_motor_notificaciones,
        CronTrigger(hour=8, minute=0, timezone=TZ_ARGENTINA),
        id="motor_notificaciones_diario",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler iniciado — motor de notificaciones corre todos los días a las 08:00 ART")
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Ubicar Rent API",
    description="Sistema de gestión de alquiler de vehículos",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
origins = [settings.frontend_url, "http://localhost:3000", "http://localhost:5173"]
if settings.landing_url:
    origins.append(settings.landing_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Middleware: traducir excepciones de dominio a HTTP ───────────────────────
@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc), "success": False})


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc), "success": False})


@app.exception_handler(BusinessRuleError)
async def business_rule_handler(request: Request, exc: BusinessRuleError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc), "success": False})


@app.exception_handler(UnauthorizedError)
async def unauthorized_handler(request: Request, exc: UnauthorizedError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc), "success": False})


# ─── Routers ──────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(vehiculos.router, prefix=API_PREFIX)
app.include_router(tarifas.router, prefix=API_PREFIX)
app.include_router(clientes.router, prefix=API_PREFIX)
app.include_router(reservas.router, prefix=API_PREFIX)
app.include_router(alquileres.router, prefix=API_PREFIX)
app.include_router(contratos.router, prefix=API_PREFIX)
app.include_router(pagos.router, prefix=API_PREFIX)
app.include_router(gastos.router, prefix=API_PREFIX)
app.include_router(echeqs.router, prefix=API_PREFIX)
app.include_router(documentos.router, prefix=API_PREFIX)
app.include_router(cotizador.router, prefix=API_PREFIX)
app.include_router(reportes.router, prefix=API_PREFIX)
app.include_router(public.router, prefix=API_PREFIX)
app.include_router(ocupacion.router, prefix=API_PREFIX)
app.include_router(tarjetas.router, prefix=API_PREFIX)
app.include_router(multas.router, prefix=API_PREFIX)
app.include_router(servicios.router, prefix=API_PREFIX)
app.include_router(notificaciones.router, prefix=API_PREFIX)
app.include_router(cuentas_corrientes.router, prefix=API_PREFIX)
app.include_router(recibos.router, prefix=API_PREFIX)
app.include_router(categorias.router, prefix=API_PREFIX)
app.include_router(comprobantes.router, prefix=API_PREFIX)
app.include_router(danios.router, prefix=API_PREFIX)
app.include_router(fechas_especiales.router, prefix=API_PREFIX)
app.include_router(precios.router, prefix=API_PREFIX)
app.include_router(adicionales.router, prefix=API_PREFIX)
app.include_router(bloqueos.router, prefix=API_PREFIX)
app.include_router(configuracion.router, prefix=API_PREFIX)
app.include_router(busqueda.router, prefix=API_PREFIX)


# ─── Archivos estáticos (storage local) ───────────────────────────────────────
# Sirve fotos, documentos, etc. bajo /static/{key}. En prod con reverse proxy
# conviene servir esto directo desde nginx para no pasar por uvicorn.
_storage_dir = Path(settings.storage_path).resolve()
_storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_storage_dir)), name="static")


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Sistema"])
def health_check():
    """
    Verifica que el servicio y la base de datos estén operativos.
    Retorna 200 si todo está bien, 503 si la DB no responde.
    """
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        logger.error(f"Health check DB falló: {e}")
        db_status = "error"
    finally:
        db.close()

    status_code = 200 if db_status == "ok" else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if db_status == "ok" else "degraded",
            "service": "ubicar-rent-api",
            "database": db_status,
            "environment": settings.environment,
        },
    )
