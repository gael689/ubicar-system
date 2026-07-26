"""
Router de Multas — gestión de fotomultas e infracciones de tránsito.
"""
from datetime import date, time

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.multa import MultaCreate, MultaUpdate, MultaResponse, BusquedaMultaResponse
from app.services.multa_service import MultaService

router = APIRouter(prefix="/multas", tags=["Multas"])


@router.get("/buscar", response_model=None)
def buscar_responsable(
    patente: str = Query(..., description="Patente del vehículo (ej: ABC123)"),
    fecha: date = Query(..., description="Fecha de la infracción (YYYY-MM-DD)"),
    hora: str | None = Query(None, description="Hora de la infracción (HH:MM)"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Cruza patente + fecha + hora con el historial de alquileres para identificar
    al cliente responsable de la multa.
    """
    hora_parsed: time | None = None
    if hora:
        try:
            parts = hora.split(":")
            hora_parsed = time(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            hora_parsed = None

    svc = MultaService(db)
    resultado = svc.buscar_responsable(patente, fecha, hora_parsed)
    return ok(resultado.model_dump(), "Búsqueda completada")


@router.get("")
def list_multas(
    cliente_id: int | None = Query(None),
    vehiculo_id: int | None = Query(None),
    estado: str | None = Query(None),
    patente: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = MultaService(db)
    items, total = svc.list(
        cliente_id=cliente_id,
        vehiculo_id=vehiculo_id,
        estado=estado,
        patente=patente,
        page=page,
        page_size=page_size,
    )
    return paginated(
        data=[MultaResponse.model_validate(m) for m in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def crear_multa(
    payload: MultaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = MultaService(db)
    multa = svc.crear(payload)
    db.commit()
    db.refresh(multa)
    return ok(MultaResponse.model_validate(multa), "Multa registrada")


@router.get("/{multa_id}")
def get_multa(
    multa_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = MultaService(db)
    multa = svc.get(multa_id)
    return ok(MultaResponse.model_validate(multa))


@router.patch("/{multa_id}")
def actualizar_multa(
    multa_id: int,
    payload: MultaUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = MultaService(db)
    multa = svc.actualizar(multa_id, payload)
    db.commit()
    db.refresh(multa)
    return ok(MultaResponse.model_validate(multa), "Multa actualizada")


@router.delete("/{multa_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_multa(
    multa_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = MultaService(db)
    svc.eliminar(multa_id)
    db.commit()
