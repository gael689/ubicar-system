"""
Lectura del libro de auditoría (plan §6.6).

**Sólo lectura, a propósito.** No hay POST, PATCH ni DELETE: los registros los
escriben los services dentro de la misma transacción que la operación que
auditan. Un libro que se puede editar por API no sirve para auditar nada.
"""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user, require_admin
from app.core.responses import ok, paginated
from app.models.auditoria import Auditoria
from app.models.usuario import Usuario
from app.schemas.auditoria import AuditoriaResponse, OpcionesAuditoria

router = APIRouter(prefix="/auditoria", tags=["Auditoría"])


@router.get("")
def listar(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    usuario_id: int | None = None,
    accion: str | None = None,
    entidad_tipo: str | None = None,
    entidad_id: int | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    buscar: str | None = None,
):
    """
    El registro completo, del más nuevo al más viejo.

    Requiere rol admin: es el listado de todo lo que hizo cada persona, y no
    tiene por qué verlo cualquiera que entre al sistema.
    """
    q = db.query(Auditoria)

    if usuario_id is not None:
        q = q.filter(Auditoria.usuario_id == usuario_id)
    if accion:
        q = q.filter(Auditoria.accion == accion)
    if entidad_tipo:
        q = q.filter(Auditoria.entidad_tipo == entidad_tipo)
    if entidad_id is not None:
        q = q.filter(Auditoria.entidad_id == entidad_id)
    if desde:
        q = q.filter(Auditoria.created_at >= datetime.combine(desde, time.min))
    if hasta:
        # Inclusivo: quien filtra "hasta el 29" espera ver lo del 29.
        q = q.filter(Auditoria.created_at <= datetime.combine(hasta, time.max))
    if buscar:
        q = q.filter(Auditoria.descripcion.ilike(f"%{buscar.strip()}%"))

    total = q.count()
    filas = (
        q.order_by(Auditoria.created_at.desc(), Auditoria.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return paginated(
        [AuditoriaResponse.model_validate(f) for f in filas],
        total=total, page=page, page_size=page_size,
    )


@router.get("/opciones", response_model=None)
def opciones(db: Session = Depends(get_db), _: Usuario = Depends(require_admin)):
    """Valores presentes en la tabla, para armar los filtros sin listas fijas."""
    acciones = [a for (a,) in db.query(Auditoria.accion).distinct().all() if a]
    entidades = [e for (e,) in db.query(Auditoria.entidad_tipo).distinct().all() if e]
    usuarios = [
        {"id": uid, "nombre": nombre}
        for uid, nombre in (
            db.query(Auditoria.usuario_id, func.max(Auditoria.usuario_nombre))
            .filter(Auditoria.usuario_id.isnot(None))
            .group_by(Auditoria.usuario_id)
            .all()
        )
    ]
    return ok(OpcionesAuditoria(
        acciones=sorted(acciones),
        entidades=sorted(entidades),
        usuarios=sorted(usuarios, key=lambda u: (u["nombre"] or "")),
    ))


@router.get("/{entidad_tipo}/{entidad_id}")
def historial_de(
    entidad_tipo: str,
    entidad_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Todo lo que le pasó a un registro puntual.

    Esta sí la puede ver cualquiera con acceso al sistema: es el historial de
    una reserva o un cliente que ya está viendo, no la actividad de sus
    compañeros.
    """
    filas = (
        db.query(Auditoria)
        .filter(
            Auditoria.entidad_tipo == entidad_tipo,
            Auditoria.entidad_id == entidad_id,
        )
        .order_by(Auditoria.created_at.desc(), Auditoria.id.desc())
        .all()
    )
    return ok([AuditoriaResponse.model_validate(f) for f in filas])
