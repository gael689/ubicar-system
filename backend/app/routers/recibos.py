"""
Router de Recibos — el comprobante de un cobro, con descarga de PDF
(ReportLab).

**El recibo documenta un `Pago`; no mueve plata por su cuenta.** Hay dos
caminos para emitirlo:

- `POST /recibos` — cobrar y documentar de una: crea el `Pago` (que genera el
  crédito en la cuenta corriente) y su recibo.
- `POST /pagos/{id}/recibo` — el papel de un cobro ya registrado.
"""
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.recibo import ReciboCreate, ReciboResponse, AnularReciboRequest
from app.services.recibo_service import ReciboService

router = APIRouter(prefix="/recibos", tags=["Recibos"])


@router.get("")
def list_recibos(
    cliente_id: int | None = Query(None),
    estado: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ReciboService(db)
    items, total = svc.list(cliente_id=cliente_id, estado=estado, page=page, page_size=page_size)
    return paginated(
        data=[ReciboResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def crear_recibo(
    payload: ReciboCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReciboService(db)
    recibo = svc.crear(payload, usuario_id=current_user.id)
    db.commit()
    db.refresh(recibo)
    return ok(ReciboResponse.model_validate(recibo), "Cobro registrado y recibo emitido")


@router.get("/{recibo_id}")
def get_recibo(
    recibo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ReciboService(db)
    recibo = svc.get(recibo_id)
    return ok(ReciboResponse.model_validate(recibo))


@router.get("/{recibo_id}/pdf")
def descargar_pdf_recibo(
    recibo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ReciboService(db)
    pdf_bytes = svc.generar_pdf(recibo_id)
    recibo = svc.get(recibo_id)
    filename = f"recibo_{recibo.prefijo}-{recibo.numero:05d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{recibo_id}/anular")
def anular_recibo(
    recibo_id: int,
    payload: AnularReciboRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReciboService(db)
    recibo = svc.anular(recibo_id, payload.motivo, usuario_id=current_user.id)
    db.commit()
    db.refresh(recibo)
    return ok(ReciboResponse.model_validate(recibo), "Recibo anulado")
