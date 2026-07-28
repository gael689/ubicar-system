"""
Adicionales: coberturas y extras que se suman a un alquiler
(Fase 5, ítem 56 — plan §7.4).

**Los cargan los dueños con su precio.** La lista no está cerrada y cambia
con la temporada, por eso es un ABM y no un enum en el código.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.adicional import Adicional, ReservaAdicional
from app.models.usuario import Usuario
from app.schemas.adicional import (
    AdicionalCreate, AdicionalResponse, AdicionalUpdate,
)

router = APIRouter(prefix="/adicionales", tags=["Adicionales"])


def _get(db: Session, adicional_id: int) -> Adicional:
    a = db.get(Adicional, adicional_id)
    if not a:
        raise HTTPException(status_code=404, detail="Adicional no encontrado")
    return a


@router.get("")
def list_adicionales(
    grupo: str | None = Query(None, pattern="^(cobertura|extra)$"),
    solo_web: bool = Query(False, description="Sólo los publicados en la web"),
    incluir_inactivos: bool = Query(False),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Adicional)
    if not incluir_inactivos:
        q = q.filter(Adicional.activo.is_(True))
    if grupo:
        q = q.filter(Adicional.grupo == grupo)
    if solo_web:
        q = q.filter(Adicional.visible_web.is_(True))
    items = q.order_by(Adicional.grupo, Adicional.orden, Adicional.nombre).all()
    return ok([AdicionalResponse.model_validate(a) for a in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_adicional(
    payload: AdicionalCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    existente = db.query(Adicional).filter(Adicional.codigo == payload.codigo).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un adicional con el código '{payload.codigo}'",
        )
    a = Adicional(**payload.model_dump(), creado_por=current_user.id)
    db.add(a)
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional creado")


@router.patch("/{adicional_id}")
def update_adicional(
    adicional_id: int,
    payload: AdicionalUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Cambiar el precio acá **no** reescribe las reservas ya cargadas: cada
    `ReservaAdicional` congeló su precio al contratarse.
    """
    a = _get(db, adicional_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(a, campo, valor)
    if a.grupo == "extra" and a.franquicia is not None:
        raise HTTPException(
            status_code=422,
            detail="La franquicia sólo aplica a las coberturas, no a los extras",
        )
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional actualizado")


@router.delete("/{adicional_id}")
def deactivate_adicional(
    adicional_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Baja lógica. NUNCA borra el registro: las reservas que lo contrataron
    tienen que poder seguir mostrando qué se les cobró.
    """
    a = _get(db, adicional_id)
    a.activo = False
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional dado de baja")


@router.post("/{adicional_id}/reactivar")
def reactivate_adicional(
    adicional_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    a = _get(db, adicional_id)
    a.activo = True
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional reactivado")


@router.get("/reserva/{reserva_id}")
def list_adicionales_de_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Adicionales contratados en una reserva, con el precio que se pactó."""
    items = (
        db.query(ReservaAdicional)
        .filter(ReservaAdicional.reserva_id == reserva_id)
        .order_by(ReservaAdicional.id)
        .all()
    )
    return ok([
        {
            "id": ra.id,
            "adicional_id": ra.adicional_id,
            "nombre": ra.adicional.nombre if ra.adicional else None,
            "grupo": ra.adicional.grupo if ra.adicional else None,
            "cantidad": ra.cantidad,
            "precio_unitario": ra.precio_unitario,
            "unidad_cobro": ra.unidad_cobro,
            "subtotal": ra.subtotal,
        }
        for ra in items
    ])
