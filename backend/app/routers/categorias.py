"""
Router de Categorías de vehículo (D-08) — compacto, sedán, sedán superior,
SUV, pick-up, furgón. Incluye tarifas a nivel de categoría (D-08: conviven
con las tarifas por vehículo puntual, que tienen prioridad).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.deps import get_db, get_current_user, get_storage
from app.core.exceptions import BusinessRuleError
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.categoria import CategoriaCreate, CategoriaUpdate, CategoriaResponse
from app.schemas.tarifa import TarifaCreate, TarifaResponse
from app.services.categoria_service import CategoriaService
from app.services.disponibilidad_service import _url_publica
from app.services.tarifa_service import TarifaService

router = APIRouter(prefix="/categorias", tags=["Categorías"])


def _categoria_service(db: Session = Depends(get_db)) -> CategoriaService:
    return CategoriaService(db)


def _tarifa_service(db: Session = Depends(get_db)) -> TarifaService:
    return TarifaService(db)


def _respuesta(c) -> CategoriaResponse:
    """La categoría con la URL pública de su foto, igual que la ve la web."""
    return CategoriaResponse.model_validate(c).model_copy(update={"foto_url": _url_publica(c.foto_key)})


FOTO_EXT = {"jpg", "jpeg", "png", "webp"}
FOTO_MAX_BYTES = 5 * 1024 * 1024


@router.get("")
def list_categorias(
    incluir_inactivas: bool = Query(False, description="Si true, incluye las dadas de baja"),
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list(incluir_inactivas=incluir_inactivas)
    return ok([_respuesta(c) for c in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_categoria(
    payload: CategoriaCreate,
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    categoria = service.create(payload)
    return ok(_respuesta(categoria), "Categoría creada")


@router.get("/{categoria_id}")
def get_categoria(
    categoria_id: int,
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    categoria = service.get(categoria_id)
    return ok(_respuesta(categoria))


@router.patch("/{categoria_id}")
def update_categoria(
    categoria_id: int,
    payload: CategoriaUpdate,
    service: CategoriaService = Depends(_categoria_service),
    _: Usuario = Depends(get_current_user),
):
    categoria = service.update(categoria_id, payload)
    return ok(_respuesta(categoria), "Categoría actualizada")


@router.post("/{categoria_id}/foto")
async def upload_foto_categoria(
    categoria_id: int,
    file: UploadFile = File(...),
    service: CategoriaService = Depends(_categoria_service),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    """
    La foto de la categoría, la que muestra la tarjeta de la web (14/10).

    No había forma de cambiarla desde el panel: las fotos se cargaban a mano en
    el bucket. La clave lleva la hora para que la web y las redes no sigan
    mostrando la anterior desde su caché.
    """
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in FOTO_EXT:
        raise BusinessRuleError(
            "foto_extension_invalida", f"Usá una foto {', '.join(sorted(FOTO_EXT))}.",
        )
    content = await file.read()
    if len(content) > FOTO_MAX_BYTES:
        raise BusinessRuleError("foto_demasiado_grande", "La foto pesa más de 5 MB.")
    categoria = service.get(categoria_id)
    key = f"categorias/{categoria.id}-{datetime.now():%Y%m%d%H%M%S}.{ext}"
    storage.upload(key, content, file.content_type or "image/jpeg")
    categoria.foto_key = key
    service.db.commit()
    service.db.refresh(categoria)
    return ok(_respuesta(categoria), "Foto subida")


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
