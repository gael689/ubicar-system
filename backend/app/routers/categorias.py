"""
Router de Categorías de vehículo (D-08) — compacto, sedán, sedán superior,
SUV, pick-up, furgón. Incluye tarifas a nivel de categoría (D-08: conviven
con las tarifas por vehículo puntual, que tienen prioridad).
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.categoria import CategoriaCreate, CategoriaUpdate, CategoriaResponse
from app.schemas.tarifa import TarifaCreate, TarifaResponse
from app.services.categoria_service import CategoriaService
from app.services.tarifa_service import TarifaService

router = APIRouter(prefix="/categorias", tags=["Categorías"])


def _categoria_service(db: Session = Depends(get_db)) -> CategoriaService:
    return CategoriaService(db)


def _tarifa_service(db: Session = Depends(get_db)) -> TarifaService:
    return TarifaService(db)


@router.get("")
def list_categorias(
    incluir_inactivas: bool = Query(False, description="Si true, incluye las dadas de baja"),
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list(incluir_inactivas=incluir_inactivas)
    return ok([CategoriaResponse.model_validate(c) for c in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_categoria(
    payload: CategoriaCreate,
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    categoria = service.create(payload)
    return ok(CategoriaResponse.model_validate(categoria), "Categoría creada")


@router.get("/{categoria_id}")
def get_categoria(
    categoria_id: int,
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    categoria = service.get(categoria_id)
    return ok(CategoriaResponse.model_validate(categoria))


@router.patch("/{categoria_id}")
def update_categoria(
    categoria_id: int,
    payload: CategoriaUpdate,
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    categoria = service.update(categoria_id, payload)
    return ok(CategoriaResponse.model_validate(categoria), "Categoría actualizada")


@router.delete("/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_categoria(
    categoria_id: int,
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica."""
    service.deactivate(categoria_id)


# --- Tarifas de la categoría ---

@router.get("/{categoria_id}/tarifas")
def list_tarifas_categoria(
    categoria_id: int,
    incluir_inactivas: bool = Query(False),
    service: TarifaService = Depends(_tarifa_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list_by_categoria(categoria_id, incluir_inactivas=incluir_inactivas)
    return ok([TarifaResponse.model_validate(t) for t in items])


@router.post("/{categoria_id}/tarifas", status_code=status.HTTP_201_CREATED)
def create_tarifa_categoria(
    categoria_id: int,
    payload: TarifaCreate,
    service: TarifaService = Depends(_tarifa_service),
    _: Usuario = Depends(get_current_user),
):
    tarifa = service.create_for_categoria(categoria_id, payload)
    return ok(TarifaResponse.model_validate(tarifa), "Tarifa de categoría creada")
