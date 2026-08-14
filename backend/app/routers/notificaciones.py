"""
Router de Notificaciones — Fase 2 del plan maestro. Motor de reglas
unificado sobre la tabla `notificaciones` (persistida, con historial),
reemplazando el cómputo on-demand que tenía este router antes.
"""
import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.notificacion import (
    GenerarNotificacionesResponse,
    NotificacionesListResponse,
    NotificacionResponse,
    PosponerNotificacionRequest,
    PreferenciaNotificacionRequest,
    PreferenciaNotificacionResponse,
)
from app.services.notificacion_service import NotificacionService

router = APIRouter(tags=["Notificaciones"])


def _service(db: Session = Depends(get_db)) -> NotificacionService:
    return NotificacionService(db)


@router.get("/notificaciones", response_model=None)
def list_notificaciones(
    urgencia: str | None = Query(None, description="Una o varias separadas por coma"),
    tipo: str | None = Query(None, description="Una o varias separadas por coma"),
    entidad_tipo: str | None = Query(None, description="reserva, vehiculo, cliente, echeq…"),
    service: NotificacionService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Notificaciones activas, **las urgentes primero**, y sin las que este
    usuario ya marcó vistas (acuse por usuario — C-9: que uno la lea no la
    esconde para los demás).

    `urgencia` y `tipo` admiten varios valores separados por coma
    (`?urgencia=critica,alta`). Los contadores `criticas`/`urgentes` se
    calculan sobre lo filtrado, así que el número del badge siempre coincide
    con lo que se ve en la lista.
    """
    items = service.list_activas(
        urgencia=urgencia, tipo=tipo, entidad_tipo=entidad_tipo, usuario_id=current_user.id,
    )
    criticas = sum(1 for i in items if i.urgencia == "critica")
    urgentes = sum(1 for i in items if i.urgencia in ("critica", "alta"))
    return ok(NotificacionesListResponse(
        items=[NotificacionResponse.model_validate(i) for i in items],
        total=len(items),
        criticas=criticas,
        urgentes=urgentes,
    ).model_dump())


@router.get("/notificaciones/historial")
def historial_notificaciones(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    solo_resueltas: bool = Query(True),
    fecha: date | None = Query(None),
    anio: int | None = Query(None),
    mes: int | None = Query(None, ge=1, le=12),
    tipo: str | None = Query(None, description="Una o varias separadas por coma"),
    urgencia: str | None = Query(None, description="Una o varias separadas por coma"),
    entidad_tipo: str | None = Query(None),
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items, total = service.list_historial(
        page=page, page_size=page_size, solo_resueltas=solo_resueltas,
        fecha=fecha, anio=anio, mes=mes,
        tipo=tipo, urgencia=urgencia, entidad_tipo=entidad_tipo,
    )
    return paginated([NotificacionResponse.model_validate(i) for i in items], total, page, page_size)


@router.post("/notificaciones/generar")
def generar_notificaciones(
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """Dispara el motor de reglas manualmente (además de la corrida diaria
    del scheduler a las 08:00 ART). Lo usa el botón 'actualizar' de la
    campana para no depender únicamente del cron."""
    resultado = service.generar(hoy=date.today())
    db.commit()
    return ok(GenerarNotificacionesResponse(**resultado).model_dump(), "Motor de notificaciones ejecutado")


@router.post("/notificaciones/cron")
def cron_notificaciones(
    request: Request,
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
):
    """
    La corrida diaria disparada por un cron **externo**.

    Existe para el caso serverless: ahí no hay proceso vivo a las 08:00, así
    que el scheduler interno nunca se dispara y hay que llamar al motor por
    HTTP. En un contenedor de larga vida (Railway) esto no hace falta —
    `main.py` ya corre el scheduler solo.

    **Protegido por `CRON_SECRET`**, no por sesión: quien llama es una máquina,
    no una persona logueada. Sin el secreto configurado el endpoint queda
    deshabilitado, para que no sea un agujero abierto por olvido.

    También limpia los holds vencidos, que es housekeeping puro: un hold
    vencido ya dejó de ocupar cupo en el instante en que venció.
    """
    from app.config import settings
    from app.services.hold_service import HoldService

    if not settings.cron_secret:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El endpoint de cron no está habilitado",
        )

    enviado = request.headers.get("authorization", "")
    esperado = f"Bearer {settings.cron_secret}"
    # Comparación en tiempo constante: una comparación normal filtra el
    # secreto carácter por carácter midiendo cuánto tarda en fallar.
    if not secrets.compare_digest(enviado, esperado):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")

    resultado = service.generar(hoy=date.today())
    holds_limpiados = HoldService(db).limpiar_vencidos()
    db.commit()

    return ok(
        {**resultado, "holds_limpiados": holds_limpiados},
        "Corrida diaria ejecutada",
    )


@router.post("/notificaciones/{id}/leer")
def marcar_leida(
    id: int,
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    n = service.marcar_leida(id, current_user.id)
    db.commit()
    return ok(NotificacionResponse.model_validate(n).model_dump(), "Notificación marcada como leída")


@router.post("/notificaciones/{id}/posponer")
def posponer_notificacion(
    id: int,
    payload: PosponerNotificacionRequest,
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    n = service.posponer(id, payload.hasta)
    db.commit()
    return ok(NotificacionResponse.model_validate(n).model_dump(), "Notificación pospuesta")


@router.post("/notificaciones/{id}/descartar")
def descartar_notificacion(
    id: int,
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    n = service.descartar(id)
    db.commit()
    return ok(NotificacionResponse.model_validate(n).model_dump(), "Notificación descartada")


@router.post("/notificaciones/enviar-digest")
def enviar_digest(
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """Dispara el digest matutino a mano (el scheduler ya lo manda todos los
    días a las 08:00 ART junto con `generar()`). Útil para probarlo sin
    esperar al cron, o para un botón de 'enviar ahora' más adelante."""
    enviados = service.enviar_digest_matutino()
    db.commit()  # persiste el registro en `emails_enviados`
    return ok({"enviados": enviados}, "Digest procesado" if enviados else "Nada para enviar (sin destinatarios configurados o sin notificaciones activas)")


@router.get("/notificaciones/preferencias")
def list_preferencias(
    service: NotificacionService = Depends(_service),
    user: Usuario = Depends(get_current_user),
):
    prefs = service.list_preferencias(user.id)
    return ok([PreferenciaNotificacionResponse.model_validate(p) for p in prefs])


@router.put("/notificaciones/preferencias")
def set_preferencia(
    payload: PreferenciaNotificacionRequest,
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
    user: Usuario = Depends(get_current_user),
):
    pref = service.set_preferencia(
        usuario_id=user.id,
        tipo_regla=payload.tipo_regla,
        canales=payload.canales,
        anticipacion_dias=payload.anticipacion_dias,
        activo=payload.activo,
    )
    db.commit()
    return ok(PreferenciaNotificacionResponse.model_validate(pref).model_dump(), "Preferencia guardada")
