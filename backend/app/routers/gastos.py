from datetime import date
from fastapi import APIRouter, Depends, Query, status
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
    _: Usuario = Depends(get_current_user),
):
    gasto = service.update(gasto_id, payload)
    return ok(GastoResponse.model_validate(gasto), "Gasto actualizado")


@router.delete("/gastos/{gasto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gasto(
    gasto_id: int,
    service: GastoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """Borrado físico (gastos no son entidad auditada en F1)."""
    service.delete(gasto_id)
