"""
Fechas especiales: feriados, fechas comerciales y temporadas.

Hoy sirven para que el administrador las vea en el calendario de ocupación.
En la Fase 5 (ítem 57) van a ser el ancla de las reglas de precio: una regla
de `tarifas_calendario` va a poder apuntar a una fecha especial en vez de
repetir el rango a mano.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.fecha_especial import FechaEspecial
from app.schemas.fecha_especial import (
    FechaEspecialCreate, FechaEspecialUpdate, FechaEspecialResponse,
)

router = APIRouter(prefix="/fechas-especiales", tags=["Fechas especiales"])


def _get(db: Session, fecha_id: int) -> FechaEspecial:
    fe = db.get(FechaEspecial, fecha_id)
    if not fe:
        raise HTTPException(status_code=404, detail="Fecha especial no encontrada")
    return fe


@router.get("")
def list_fechas_especiales(
    desde: date | None = Query(None, description="Devuelve las que se solapan con el rango"),
    hasta: date | None = Query(None),
    tipo: str | None = Query(None),
    incluir_inactivas: bool = Query(False),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(FechaEspecial)
    if not incluir_inactivas:
        q = q.filter(FechaEspecial.activo.is_(True))
    if tipo:
        q = q.filter(FechaEspecial.tipo == tipo)
    # Solapamiento de rangos: empieza antes de que termine la ventana y
    # termina después de que empiece.
    if hasta:
        q = q.filter(FechaEspecial.fecha_desde <= hasta)
    if desde:
        q = q.filter(FechaEspecial.fecha_hasta >= desde)
    items = q.order_by(FechaEspecial.fecha_desde).all()
    return ok([FechaEspecialResponse.model_validate(f) for f in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_fecha_especial(
    payload: FechaEspecialCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    fe = FechaEspecial(**payload.model_dump(), creado_por=current_user.id)
    db.add(fe)
    db.commit()
    db.refresh(fe)
    return ok(FechaEspecialResponse.model_validate(fe), "Fecha especial creada")


@router.patch("/{fecha_id}")
def update_fecha_especial(
    fecha_id: int,
    payload: FechaEspecialUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    fe = _get(db, fecha_id)
    cambios = payload.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(fe, campo, valor)
    if fe.fecha_hasta < fe.fecha_desde:
        raise HTTPException(
            status_code=422, detail="La fecha de fin no puede ser anterior a la de inicio"
        )
    db.commit()
    db.refresh(fe)
    return ok(FechaEspecialResponse.model_validate(fe), "Fecha especial actualizada")


@router.delete("/{fecha_id}")
def deactivate_fecha_especial(
    fecha_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica. NUNCA borra el registro."""
    fe = _get(db, fecha_id)
    fe.activo = False
    db.commit()
    db.refresh(fe)
    return ok(FechaEspecialResponse.model_validate(fe), "Fecha especial dada de baja")


@router.post("/{fecha_id}/reactivar")
def reactivate_fecha_especial(
    fecha_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    fe = _get(db, fecha_id)
    fe.activo = True
    db.commit()
    db.refresh(fe)
    return ok(FechaEspecialResponse.model_validate(fe), "Fecha especial reactivada")
