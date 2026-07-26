from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.echeq import Echeq
from app.schemas.echeq import EcheqCreate, EcheqUpdate, EcheqResponse

router = APIRouter(prefix="/echeqs", tags=["Echeqs"])


@router.get("")
def list_echeqs(
    estado: str | None = Query(None),
    tipo: str | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Echeq)
    if estado:
        q = q.filter(Echeq.estado == estado)
    if tipo:
        q = q.filter(Echeq.tipo == tipo)
    return ok([EcheqResponse.model_validate(e) for e in q.order_by(Echeq.fecha_cobro).all()])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_echeq(
    payload: EcheqCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    echeq = Echeq(**payload.model_dump())
    db.add(echeq)
    db.commit()
    db.refresh(echeq)
    return ok(EcheqResponse.model_validate(echeq), "Echeq registrado")


@router.patch("/{echeq_id}")
def update_echeq(
    echeq_id: int,
    payload: EcheqUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    echeq = db.query(Echeq).filter(Echeq.id == echeq_id).first()
    if not echeq:
        raise HTTPException(status_code=404, detail="Echeq no encontrado")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(echeq, field, value)
    db.commit()
    db.refresh(echeq)
    return ok(EcheqResponse.model_validate(echeq), "Echeq actualizado")
