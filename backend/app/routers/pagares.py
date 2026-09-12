"""
Router del pagaré. Plan y decisiones en `docs/PAGARE.md`.

El pagaré se emite desde el mismo panel que el contrato y se firma con él: la
firma no tiene endpoint propio acá. `POST /contratos/{id}/firmar` (mostrador) y
`POST /public/contratos/{token}/firmar` (link) firman los dos documentos en el
mismo acto — ver `ContratoService.firmar`.
"""
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.responses import ok
from app.models.pagare import Pagare
from app.models.usuario import Usuario
from app.schemas.pagare import AnularPagareRequest, PagareCreate, PagareResponse
from app.services.pagare_service import PagareService

router = APIRouter(prefix="/pagares", tags=["Pagarés"])


def _respuesta(p: Pagare) -> PagareResponse:
    r = PagareResponse.model_validate(p)
    r.numero_formateado = p.numero_formateado
    r.tiene_escaneo = bool(p.escaneo_key)
    return r


@router.get("/preparar/{reserva_id}")
def preparar_pagare(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Lo precargado para emitir: monto sugerido, deudor, tasas y qué falta."""
    try:
        return ok(PagareService(db).preparar(reserva_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("")
def list_pagares(
    reserva_id: int | None = Query(None),
    solo_vigentes: bool = Query(True),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Pagare)
    if reserva_id is not None:
        q = q.filter(Pagare.reserva_id == reserva_id)
    if solo_vigentes:
        q = q.filter(Pagare.anulado.is_(False))
    return ok([_respuesta(p) for p in q.order_by(Pagare.id.desc()).all()])


@router.post("", status_code=status.HTTP_201_CREATED)
def crear_pagare(
    payload: PagareCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        pagare = PagareService(db).crear(
            payload.reserva_id,
            monto=payload.monto,
            codeudores=[c.model_dump() for c in payload.codeudores],
            usuario_id=current_user.id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    db.refresh(pagare)
    return ok(_respuesta(pagare), "Pagaré generado")


@router.post("/{pagare_id}/anular")
def anular_pagare(
    pagare_id: int,
    payload: AnularPagareRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    try:
        pagare = PagareService(db).anular(pagare_id, payload.motivo, current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    db.refresh(pagare)
    return ok(_respuesta(pagare), "Pagaré anulado")


@router.post("/{pagare_id}/escaneo")
async def subir_escaneo_pagare(
    pagare_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    El ejemplar firmado a mano. **Para un pagaré importa más que para el
    contrato**: si alguna vez hay que cobrarlo por vía ejecutiva, lo que se
    presenta es el papel con la firma en tinta. Ver `docs/PAGARE.md`.
    """
    contenido = await archivo.read()
    if len(contenido) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo supera los 10 MB.")
    try:
        pagare = PagareService(db).adjuntar_escaneo(
            pagare_id, contenido, archivo.content_type or "application/octet-stream"
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    db.refresh(pagare)
    return ok(_respuesta(pagare), "Pagaré firmado adjuntado")


@router.get("/{pagare_id}/escaneo")
def descargar_escaneo_pagare(
    pagare_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    from app.core.deps import get_storage

    try:
        pagare = PagareService(db).get(pagare_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not pagare.escaneo_key:
        raise HTTPException(status_code=404, detail="Este pagaré no tiene el papel adjuntado")
    try:
        contenido = get_storage().read(pagare.escaneo_key)
    except Exception:
        raise HTTPException(status_code=404, detail="El archivo ya no está disponible. Volvé a subirlo.")
    extension = pagare.escaneo_key.rsplit(".", 1)[-1].lower()
    tipos = {"pdf": "application/pdf", "jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return Response(
        content=contenido,
        media_type=tipos.get(extension, "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="pagare_firmado_{pagare.numero_formateado}.{extension}"'},
    )


@router.get("/{pagare_id}/pdf")
def descargar_pdf_pagare(
    pagare_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = PagareService(db)
    try:
        pagare = svc.get(pagare_id)
        pdf = svc.generar_pdf(pagare_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="pagare_{pagare.numero_formateado}.pdf"'},
    )
