from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario

router = APIRouter(prefix="/contratos", tags=["Contratos"])


@router.post("/{alquiler_id}/generar")
def generar_contrato(
    alquiler_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    # TODO Fase 5: implementar generación de PDF y almacenamiento
    return ok(None, "Módulo en construcción — Fase 5")
