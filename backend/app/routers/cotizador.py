from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.presupuesto import Presupuesto
from app.schemas.presupuesto import PresupuestoCreate, PresupuestoResponse
from app.utils.helpers import calcular_dias

router = APIRouter(prefix="/cotizador", tags=["Cotizador"])


@router.post("/calcular")
def calcular_cotizacion(
    vehiculo_id: int | None = Query(None),
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    _: Usuario = Depends(get_current_user),
):
    dias = calcular_dias(fecha_inicio, fecha_fin)
    # TODO Fase 8: obtener tarifa real de DB con domain/tarifas.py
    return ok({"dias": dias, "tarifa_sugerida": None})


@router.get("/presupuestos")
def list_presupuestos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    items = db.query(Presupuesto).order_by(Presupuesto.created_at.desc()).all()
    return ok([PresupuestoResponse.model_validate(p) for p in items])


@router.post("/presupuestos", status_code=status.HTTP_201_CREATED)
def create_presupuesto(
    payload: PresupuestoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    dias = calcular_dias(payload.fecha_inicio, payload.fecha_fin)
    total = dias * payload.tarifa_unitaria * (1 - payload.descuento / 100)
    presupuesto = Presupuesto(**payload.model_dump(), dias=dias, total=total, created_by=current_user.id)
    db.add(presupuesto)
    db.commit()
    db.refresh(presupuesto)
    return ok(PresupuestoResponse.model_validate(presupuesto), "Presupuesto creado")
