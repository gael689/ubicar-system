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
    precios, adicionales, bloqueos, recargos_edad, reservas_web, auditoria,
    emails,
)

logger = logging.getLogger(__name__)

TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")


def _correr_motor_notificaciones(con_digest: bool = False) -> None:
    """
    Job del scheduler: corre todas las reglas del catálogo
    (domain/notificaciones_reglas.py), persiste lo nuevo, auto-resuelve lo
    que ya no aplica, y escala la urgencia de lo que nadie atendió (C-9).

    **Plan de conexión (13/08):** antes esto corría una sola vez al día, a
    las 08:00. Una reserva web que entra el sábado a la tarde quedaba sin
    ningún barrido de red-de-seguridad hasta el lunes a la mañana — el aviso
    instantáneo (`avisar_reserva_web`) podía fallar en silencio y nadie se
    enteraba durante 36 horas. Ahora corre cada 30 minutos (ver `lifespan`);
    el digest matutino por mail —que si saliera cada 30 minutos sería spam,
    no un resumen— sigue siendo sólo de las 08:00, con `con_digest=True`.
    """
    from app.services.notificacion_service import NotificacionService
    from app.services.reserva_service import ReservaService

    db = SessionLocal()
    try:
        # C-12: los estados por horario (pendiente → vencida, etc.) se
        # sincronizaban sólo cuando alguien abría el calendario. Sin nadie
        # mirando, una reserva podía seguir "confirmada" horas después de
        # vencida — y la regla `checkin_vencido` recién corría a las 08:00,
        # antes de que nadie hubiera mirado. Va primero: las reglas de abajo
        # tienen que evaluar sobre estados ya al día.
        ReservaService(db).sincronizar_estados_por_horario()
        db.commit()

        service = NotificacionService(db)
        resultado = service.generar()
        escaladas = service.escalar_urgencias()
        db.commit()
        logger.info(
            "[Scheduler] Motor de notificaciones: %s creadas, %s resueltas, %s escaladas, %s evaluadas",
            resultado["creadas"], resultado["resueltas"], escaladas, resultado["evaluadas"],
        )

        if con_digest:
            enviados = service.enviar_digest_matutino()
            # El commit es por el registro en `emails_enviados`: sin él, un
            # digest que no salió no queda anotado en ningún lado.
            db.commit()
            if enviados:
                logger.info("[Scheduler] Digest matutino enviado a %s destinatarios", enviados)
    except Exception:
        db.rollback()
        logger.exception("[Scheduler] Falló la corrida del motor de notificaciones")
    finally:
        db.close()


def _verificar_configuracion_segura() -> None:
    """
    Cortafuegos de arranque.

    Una guarda por request se saltea por omisión —basta con que un endpoint
    nuevo no la use—; una que impide que el proceso levante, no. Si algo de
    esto está mal en producción, es preferible que el deploy falle ruidoso a
    que quede sirviendo con el back-office abierto o cobrando de mentira.
    """
    if not settings.is_production:
        return

    problemas = []
    if settings.dev_bypass_auth:
        problemas.append(
            "DEV_BYPASS_AUTH está activo: la API entera quedaría sin autenticación"
        )
    if settings.pagos_provider == "fake":
        problemas.append(
            "PAGOS_PROVIDER=fake: se confirmarían reservas sin cobrar"
        )
    if not settings.clerk_jwks_url:
        problemas.append(
            "CLERK_JWKS_URL vacía: todos los endpoints autenticados darían 500"
        )
    if problemas:
        raise RuntimeError(
            "Configuración insegura para producción:\n  - " + "\n  - ".join(problemas)
        )

    # El storage sí arranca, pero a los gritos. A diferencia de los tres de
    # arriba —que dejan el sistema abierto o cobrando de mentira— acá el daño
    # es que los archivos subidos desaparecen en el próximo despliegue: grave,
    # pero visible y recuperable. Bloquear el arranque por esto impediría
    # levantar el sistema mientras se tramita el bucket, que es justo cuando
    # hace falta tenerlo andando.
    if settings.storage_provider == "local":
        logger.warning(
            "⚠️  STORAGE_PROVIDER=local en producción: los documentos, las fotos "
            "de daños y las firmas SE VAN A PERDER en cada despliegue. Configurar "
            "un bucket (r2/s3) o un volumen persistente."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _verificar_configuracion_segura()

    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    scheduler = AsyncIOScheduler(timezone=TZ_ARGENTINA)
    # La corrida de las 08:00 es la que manda el digest — una vez al día,
    # como corresponde a un resumen.
    scheduler.add_job(
        _correr_motor_notificaciones,
        CronTrigger(hour=8, minute=0, timezone=TZ_ARGENTINA),
        kwargs={"con_digest": True},
        id="motor_notificaciones_diario",
        replace_existing=True,
    )
    # El resto del día corre sin digest, cada 30 minutos (plan de conexión
    # 13/08, punto 1.6): es lo que hace que una reserva web sin atender
    # escale de `alta` a `crítica` en horas y no al día siguiente, y lo que
    # mantiene el calendario de ocupación al día sin depender de que alguien
    # lo tenga abierto (C-12).
    scheduler.add_job(
        _correr_motor_notificaciones,
        IntervalTrigger(minutes=30),
        kwargs={"con_digest": False},
        id="motor_notificaciones_frecuente",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler iniciado — motor de notificaciones cada 30 min, digest a las 08:00 ART"
    )
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Ubicar Rent API",
    description="Sistema de gestión de alquiler de vehículos",
    version="1.0.0",
    # En producción se cierra la documentación: no es una vulnerabilidad, pero
    # le entrega a cualquiera el mapa completo de los ~185 endpoints internos
    # con sus esquemas. No hay razón para publicarlo.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# 5173 = frontend/ (Vite, sistema interno). 3200 = web/ (Next, landing y
# flujo de reserva) — tiene puerto propio para no competir por el 3000, que
# queda libre para lo que se levante a mano.
origins = [settings.frontend_url]

# `WEB_URL` y `LANDING_URL` son la misma web pública. Existen las dos porque
# `WEB_URL` alimenta las URLs de retorno de Mercado Pago y `LANDING_URL` nació
# como el origen de CORS — y cargar sólo una rompía algo en silencio: sin
# `WEB_URL` la preferencia de pago falla, sin `LANDING_URL` el navegador
# bloquea la web entera. Se aceptan las dos y se usa la que esté.
for url in (settings.web_url, settings.landing_url):
    if url and url not in origins:
        origins.append(url)

# Los localhost sólo fuera de producción: en producción son orígenes válidos
# que no le sirven a nadie más que a un atacante con algo corriendo en la
# máquina de la víctima.
if not settings.is_production:
    for url in ("http://localhost:3000", "http://localhost:3200", "http://localhost:5173"):
        if url not in origins:
            origins.append(url)

# Orígenes extra, explícitos. Sirven para correr la web en la máquina de uno
# apuntando al backend ya desplegado, sin tener que reabrir los localhost para
# todo el mundo.
for url in (o.strip() for o in settings.cors_extra_origins.split(",")):
    if url and url not in origins:
        origins.append(url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Middleware: la IP de quien pide, disponible para la auditoría ────────────
# Va por ContextVar y no como parámetro porque enhebrar el `Request` hasta el
# fondo de veinte services, sólo para tener un dato de diagnóstico, habría
# ensuciado todas las firmas del dominio.
@app.middleware("http")
async def _contexto_auditoria(request: Request, call_next):
    from app.core.rate_limit import ip_del_cliente
    from app.services import auditoria_service

    auditoria_service.fijar_ip(ip_del_cliente(request))
    return await call_next(request)

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
app.include_router(emails.router, prefix=API_PREFIX)
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
app.include_router(auditoria.router, prefix=API_PREFIX)


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
