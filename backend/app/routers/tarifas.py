from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.tarifa import TarifaCreate, TarifaResponse, TarifaUpdate
from app.services.tarifa_service import TarifaService

router = APIRouter(tags=["Tarifas"])


def _service(db: Session = Depends(get_db)) -> TarifaService:
    return TarifaService(db)


@router.get("/vehiculos/{vehiculo_id}/tarifas")
def list_tarifas(
    vehiculo_id: int,
    incluir_inactivas: bool = Query(False, description="Si true, incluye histórico"),
    service: TarifaService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list(vehiculo_id, incluir_inactivas=incluir_inactivas)
    return ok([TarifaResponse.model_validate(t) for t in items])


@router.post("/vehiculos/{vehiculo_id}/tarifas", status_code=status.HTTP_201_CREATED)
def create_tarifa(
    vehiculo_id: int,
    payload: TarifaCreate,
    service: TarifaService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    tarifa = service.create_for_vehiculo(vehiculo_id, payload)
    return ok(TarifaResponse.model_validate(tarifa), "Tarifa creada")


@router.patch("/tarifas/{tarifa_id}")
def update_tarifa(
    tarifa_id: int,
    payload: TarifaUpdate,
    service: TarifaService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    tarifa = service.update(tarifa_id, payload)
    return ok(TarifaResponse.model_validate(tarifa), "Tarifa actualizada")


@router.delete("/tarifas/{tarifa_id}")
def deactivate_tarifa(
    tarifa_id: int,
    service: TarifaService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica."""
    tarifa = service.deactivate(tarifa_id)
    return ok(TarifaResponse.model_validate(tarifa), "Tarifa desactivada")
