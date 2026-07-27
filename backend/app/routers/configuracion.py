"""Router de Configuración — Fase 3, ítem 40."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_admin
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.configuracion import ConfiguracionResponse, ConfiguracionUpdateRequest
from app.services.configuracion_service import ConfiguracionService

router = APIRouter(prefix="/configuracion", tags=["Configuración"])


@router.get("")
def list_configuracion(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    items = ConfiguracionService(db).list()
    return ok([ConfiguracionResponse.model_validate(i) for i in items])


@router.patch("/{clave}")
def update_configuracion(
    clave: str,
    payload: ConfiguracionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    conf = ConfiguracionService(db).set_valor(clave, payload.valor, current_user.id)
    db.commit()
    return ok(ConfiguracionResponse.model_validate(conf).model_dump(), "Configuración actualizada")
