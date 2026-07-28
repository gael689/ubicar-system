"""
Router de Recargos por edad (D-38).

ABM de las franjas etarias que modifican el precio. **No hay edad mínima**: la
edad no rechaza a nadie, cambia lo que paga.

Baja lógica (`activo=False`), como toda entidad de dominio del proyecto: una
franja que se saca de circulación tiene que seguir explicando el recargo de
las reservas que ya la aplicaron.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import NotFoundError
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.recargo_edad import RecargoEdad
from app.schemas.recargo_edad import (
    RecargoEdadCreate, RecargoEdadResponse, RecargoEdadUpdate,
)

router = APIRouter(prefix="/recargos-edad", tags=["Recargos por edad"])


def _get(db: Session, id: int) -> RecargoEdad:
    r = db.query(RecargoEdad).filter(RecargoEdad.id == id).first()
    if not r:
        raise NotFoundError("Recargo por edad", id)
    return r


@router.get("")
def list_recargos(
    incluir_inactivos: bool = Query(False),
    categoria_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(RecargoEdad)
    if not incluir_inactivos:
        q = q.filter(RecargoEdad.activo.is_(True))
    if categoria_id is not None:
        q = q.filter(
            (RecargoEdad.categoria_id == categoria_id) | (RecargoEdad.categoria_id.is_(None))
        )
    items = q.order_by(RecargoEdad.edad_desde, RecargoEdad.id).all()
    return ok([RecargoEdadResponse.model_validate(r) for r in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_recargo(
    payload: RecargoEdadCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    recargo = RecargoEdad(**payload.model_dump(), creado_por=current_user.id)
    db.add(recargo)
    db.commit()
    db.refresh(recargo)
    return ok(RecargoEdadResponse.model_validate(recargo), "Recargo creado")


@router.patch("/{recargo_id}")
def update_recargo(
    recargo_id: int,
    payload: RecargoEdadUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    recargo = _get(db, recargo_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(recargo, campo, valor)
    db.commit()
    db.refresh(recargo)
    return ok(RecargoEdadResponse.model_validate(recargo), "Recargo actualizado")


@router.delete("/{recargo_id}")
def baja_recargo(
    recargo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica: las reservas que ya lo aplicaron conservan su explicación."""
    recargo = _get(db, recargo_id)
    recargo.activo = False
    db.commit()
    return ok(None, "Recargo dado de baja")
