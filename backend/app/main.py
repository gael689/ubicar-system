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
    precios, adicionales, bloqueos, recargos_edad, reservas_web,
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
# 5173 = frontend/ (Vite, sistema interno). 3200 = web/ (Next, landing y
# flujo de reserva) — tiene puerto propio para no competir por el 3000, que
# queda libre para lo que se levante a mano.
origins = [
    settings.frontend_url,
    "http://localhost:3000",
    "http://localhost:3200",
    "http://localhost:5173",
]
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
app.include_router(recargos_edad.router, prefix=API_PREFIX)
app.include_router(reservas_web.router, prefix=API_PREFIX)
app.include_router(bloqueos.router, prefix=API_PREFIX)
app.include_router(configuracion.router, prefix=API_PREFIX)
app.include_router(busqueda.router, prefix=API_PREFIX)


# ─── Archivos estáticos ───────────────────────────────────────────────────────
# Sólo con storage local: sirve fotos y documentos bajo /static/{key}.
#
# Con storage en bucket (r2/s3) esto **no se monta**: los archivos los sirve
# el CDN del bucket directamente, que es más rápido y no pasa por la API. Es
# también la configuración obligatoria en un hosting serverless, donde el
# disco es efímero y montar un directorio no tendría sentido.
if (settings.storage_provider or "local").lower() == "local":
    _storage_dir = Path(settings.storage_path).resolve()
    _storage_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(_storage_dir)), name="static")


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Sistema"])
def health_check():
    """
    Verifica que el servicio, la base y el almacenamiento estén operativos.

    **Chequea el storage además de la base** porque una configuración mal
    cargada ahí no rompe el arranque: la API responde perfecto y recién falla
    cuando alguien sube una foto de un daño. Es exactamente la clase de error
    que uno quiere ver en el health check y no en el mostrador.

    Devuelve 503 si la base no responde. Un storage caído deja el servicio en
    `degraded` pero con 200: se puede seguir operando, sólo que sin adjuntar
    archivos.
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

    try:
        from app.core.deps import get_storage

        storage = get_storage()
        # Escribir y leer de vuelta: que el cliente se construya no prueba que
        # las credenciales sirvan ni que el bucket exista.
        clave = ".health"
        storage.upload(clave, b"ok", "text/plain")
        storage_status = "ok" if storage.read(clave) == b"ok" else "error"
    except Exception as e:
        logger.error(f"Health check storage falló: {e}")
        storage_status = "error"

    todo_ok = db_status == "ok" and storage_status == "ok"
    return JSONResponse(
        # Sólo la base tira el servicio abajo: sin storage se puede operar.
        status_code=200 if db_status == "ok" else 503,
        content={
            "status": "ok" if todo_ok else "degraded",
            "service": "ubicar-rent-api",
            "database": db_status,
            "storage": storage_status,
            "storage_provider": settings.storage_provider,
            "environment": settings.environment,
        },
    )
