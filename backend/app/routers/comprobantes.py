"""
Router de Comprobantes — facturas/notas de crédito-débito/remitos, carga
manual con PDF adjunto (D-05: sin AFIP en esta etapa).
"""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.deps import get_current_user, get_db, get_storage
from app.core.exceptions import BusinessRuleError
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.comprobante import ComprobanteCreate, TipoComprobante, AnularComprobanteRequest
from app.services.comprobante_service import ComprobanteService

router = APIRouter(tags=["Comprobantes"])

ALLOWED_EXT = {"pdf", "jpg", "jpeg", "png"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def _service(
    db: Session = Depends(get_db),
    storage: IStorage = Depends(get_storage),
) -> ComprobanteService:
    return ComprobanteService(db, storage)


@router.get("/clientes/{cliente_id}/comprobantes")
def list_comprobantes(
    cliente_id: int,
    incluir_inactivos: bool = Query(False),
    service: ComprobanteService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list_by_cliente(cliente_id, incluir_inactivos=incluir_inactivos)
    return ok([service.to_response(c) for c in items])


@router.post("/clientes/{cliente_id}/comprobantes", status_code=status.HTTP_201_CREATED)
async def create_comprobante(
    cliente_id: int,
    tipo: TipoComprobante = Form(...),
    numero: str = Form(...),
    fecha_emision: date = Form(...),
    punto_venta: str | None = Form(None),
    fecha_vencimiento: date | None = Form(None),
    alquiler_id: int | None = Form(None),
    reserva_id: int | None = Form(None),
    neto: Decimal | None = Form(None),
    iva: Decimal | None = Form(None),
    total: Decimal = Form(...),
    file: UploadFile = File(...),
    service: ComprobanteService = Depends(_service),
    user: Usuario = Depends(get_current_user),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise BusinessRuleError(
            "comprobante_extension_invalida",
            f"Extensión '{ext}' no permitida. Usar: {', '.join(sorted(ALLOWED_EXT))}",
        )
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise BusinessRuleError(
            "comprobante_demasiado_grande",
            f"El archivo excede el máximo de {MAX_BYTES // (1024 * 1024)} MB",
        )

    payload = ComprobanteCreate(
        tipo=tipo, punto_venta=punto_venta, numero=numero,
        fecha_emision=fecha_emision, fecha_vencimiento=fecha_vencimiento,
        alquiler_id=alquiler_id, reserva_id=reserva_id,
        neto=neto, iva=iva, total=total,
    )
    comp = service.create(
        cliente_id=cliente_id,
        payload=payload,
        content=content,
        content_type=file.content_type or "application/octet-stream",
        ext=ext,
        creado_por=user.id,
    )
    return ok(service.to_response(comp), "Comprobante cargado")


@router.get("/comprobantes/{comprobante_id}")
def get_comprobante(
    comprobante_id: int,
    service: ComprobanteService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    comp = service.get(comprobante_id)
    return ok(service.to_response(comp))


@router.post("/comprobantes/{comprobante_id}/anular")
def anular_comprobante(
    comprobante_id: int,
    payload: AnularComprobanteRequest,
    db: Session = Depends(get_db),
    service: ComprobanteService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    """Baja lógica. Si era nota de crédito/débito, revierte el movimiento con contra-asiento."""
    comp = service.anular(comprobante_id, payload.motivo, current_user.id)
    db.commit()
    return ok(service.to_response(comp), "Comprobante anulado")
