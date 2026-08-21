from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.gasto import GastoCreate, GastoResponse, GastoUpdate, TipoGasto
from app.services.gasto_service import GastoService

router = APIRouter(tags=["Gastos"])


def _service(db: Session = Depends(get_db)) -> GastoService:
    return GastoService(db)


@router.get("/vehiculos/{vehiculo_id}/gastos")
def list_gastos(
    vehiculo_id: int,
    tipo: TipoGasto | None = Query(None),
    fecha_desde: date | None = Query(None, description="ISO YYYY-MM-DD"),
    fecha_hasta: date | None = Query(None, description="ISO YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: GastoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items, total = service.list(
        vehiculo_id, tipo=tipo,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        page=page, page_size=page_size,
    )
    return paginated(
        data=[GastoResponse.model_validate(g) for g in items],
        total=total, page=page, page_size=page_size,
    )


@router.post("/vehiculos/{vehiculo_id}/gastos", status_code=status.HTTP_201_CREATED)
def create_gasto(
    vehiculo_id: int,
    payload: GastoCreate,
    service: GastoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    gasto = service.create_for_vehiculo(vehiculo_id, payload)
    return ok(GastoResponse.model_validate(gasto), "Gasto registrado")


@router.patch("/gastos/{gasto_id}")
def update_gasto(
    gasto_id: int,
    payload: GastoUpdate,
    service: GastoService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    """Edita un gasto. Los cambios de monto, fecha, medio o tipo quedan auditados."""
    gasto = service.update(gasto_id, payload, usuario_id=current_user.id)
    return ok(GastoResponse.model_validate(gasto), "Gasto actualizado")


class AnularGastoRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Dar de baja un gasto requiere un motivo")
        return v.strip()


@router.post("/gastos/{gasto_id}/anular")
def anular_gasto(
    gasto_id: int,
    payload: AnularGastoRequest,
    service: GastoService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Da de baja un gasto. **No lo borra.**

    Los gastos son la mitad de "cuánto se gasta en la flota" y desde la Fase 2.5
    restan del efectivo del cajón. Borrar uno cambiaba los dos números hacia
    atrás sin dejar nada. Ver `PLAN_DINERO.md` §3.3b.
    """
    try:
        gasto = service.anular(gasto_id, payload.motivo, usuario_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ok(GastoResponse.model_validate(gasto), "Gasto dado de baja")


@router.delete("/gastos/{gasto_id}", status_code=status.HTTP_410_GONE)
def delete_gasto(gasto_id: int):
    """
    **Ya no existe.** Se devuelve 410 y no 404 a propósito: el gasto existe, la
    operación no. Usá `POST /gastos/{id}/anular`, que pide el motivo.
    """
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Un gasto no se borra: se da de baja con motivo. "
            "Usá POST /gastos/{id}/anular."
        ),
    )
