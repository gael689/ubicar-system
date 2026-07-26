from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.servicio import ServicioCreate, ServicioResponse, ServicioUpdate
from app.services.servicio_service import ServicioService

router = APIRouter(tags=["Servicios"])


def _service(db: Session = Depends(get_db)) -> ServicioService:
    return ServicioService(db)


@router.get("/vehiculos/{vehiculo_id}/servicios")
def list_servicios(
    vehiculo_id: int,
    service: ServicioService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list(vehiculo_id)
    return ok([service.to_response(s) for s in items])


@router.post("/vehiculos/{vehiculo_id}/servicios", status_code=status.HTTP_201_CREATED)
def create_servicio(
    vehiculo_id: int,
    payload: ServicioCreate,
    service: ServicioService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    s = service.create(vehiculo_id, payload)
    return ok(service.to_response(s), "Servicio registrado")


@router.patch("/servicios/{servicio_id}")
def update_servicio(
    servicio_id: int,
    payload: ServicioUpdate,
    service: ServicioService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    s = service.update(servicio_id, payload)
    return ok(service.to_response(s), "Servicio actualizado")


@router.delete("/servicios/{servicio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_servicio(
    servicio_id: int,
    service: ServicioService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    service.delete(servicio_id)
