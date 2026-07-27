"""
Router de Notificaciones — Fase 2 del plan maestro. Motor de reglas
unificado sobre la tabla `notificaciones` (persistida, con historial),
reemplazando el cómputo on-demand que tenía este router antes.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query
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
    urgencia: str | None = Query(None),
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list_activas(urgencia=urgencia)
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
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items, total = service.list_historial(
        page=page, page_size=page_size, solo_resueltas=solo_resueltas,
        fecha=fecha, anio=anio, mes=mes,
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


@router.post("/notificaciones/{id}/leer")
def marcar_leida(
    id: int,
    db: Session = Depends(get_db),
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    n = service.marcar_leida(id)
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
    service: NotificacionService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """Dispara el digest matutino a mano (el scheduler ya lo manda todos los
    días a las 08:00 ART junto con `generar()`). Útil para probarlo sin
    esperar al cron, o para un botón de 'enviar ahora' más adelante."""
    enviados = service.enviar_digest_matutino()
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
