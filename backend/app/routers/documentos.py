from datetime import date

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.deps import get_current_user, get_db, get_storage
from app.core.exceptions import BusinessRuleError
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.documento import DocumentoCreate, DocumentoResponse, DocumentoUpdate, TipoDocumento
from app.services.documento_service import DocumentoService

router = APIRouter(tags=["Documentos"])

ALLOWED_DOC_EXT = {"pdf", "jpg", "jpeg", "png", "webp"}
MAX_DOC_BYTES = 10 * 1024 * 1024  # 10 MB


def _service(
    db: Session = Depends(get_db),
    storage: IStorage = Depends(get_storage),
) -> DocumentoService:
    return DocumentoService(db, storage)


@router.get("/vehiculos/{vehiculo_id}/documentos")
def list_documentos(
    vehiculo_id: int,
    tipo: TipoDocumento | None = Query(None),
    service: DocumentoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list(vehiculo_id, tipo=tipo)
    return ok([service.to_response(d) for d in items])


@router.post("/vehiculos/{vehiculo_id}/documentos", status_code=status.HTTP_201_CREATED)
async def create_documento(
    vehiculo_id: int,
    tipo: TipoDocumento = Form(...),
    nombre: str = Form(...),
    vigencia_desde: date | None = Form(None),
    vigencia_hasta: date | None = Form(None),
    file: UploadFile = File(...),
    service: DocumentoService = Depends(_service),
    user: Usuario = Depends(get_current_user),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_DOC_EXT:
        raise BusinessRuleError(
            "documento_extension_invalida",
            f"Extensión '{ext}' no permitida. Usar: {', '.join(sorted(ALLOWED_DOC_EXT))}",
        )
    content = await file.read()
    if len(content) > MAX_DOC_BYTES:
        raise BusinessRuleError(
            "documento_demasiado_grande",
            f"El archivo excede el máximo de {MAX_DOC_BYTES // (1024 * 1024)} MB",
        )

    payload = DocumentoCreate(
        tipo=tipo, nombre=nombre,
        vigencia_desde=vigencia_desde, vigencia_hasta=vigencia_hasta,
    )
    doc = service.create(
        vehiculo_id=vehiculo_id,
        payload=payload,
        content=content,
        content_type=file.content_type or "application/octet-stream",
        ext=ext,
        cargado_por=user.id,
    )
    return ok(service.to_response(doc), "Documento cargado")


@router.patch("/documentos/{documento_id}")
def update_documento(
    documento_id: int,
    payload: DocumentoUpdate,
    service: DocumentoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    doc = service.update(documento_id, payload)
    return ok(service.to_response(doc), "Documento actualizado")


@router.delete("/documentos/{documento_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_documento(
    documento_id: int,
    service: DocumentoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    service.delete(documento_id)


# ── Documentos de Clientes/Empresas ──────────────────────────────────────────

@router.get("/clientes/{cliente_id}/documentos")
def list_documentos_cliente(
    cliente_id: int,
    tipo: TipoDocumento | None = Query(None),
    service: DocumentoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items = service.list_by_cliente(cliente_id, tipo=tipo)
    return ok([service.to_response(d) for d in items])


@router.post("/clientes/{cliente_id}/documentos", status_code=status.HTTP_201_CREATED)
async def create_documento_cliente(
    cliente_id: int,
    tipo: TipoDocumento = Form(...),
    nombre: str = Form(...),
    vigencia_desde: date | None = Form(None),
    vigencia_hasta: date | None = Form(None),
    file: UploadFile = File(...),
    service: DocumentoService = Depends(_service),
    user: Usuario = Depends(get_current_user),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_DOC_EXT:
        raise BusinessRuleError(
            "documento_extension_invalida",
            f"Extensión '{ext}' no permitida. Usar: {', '.join(sorted(ALLOWED_DOC_EXT))}",
        )
    content = await file.read()
    if len(content) > MAX_DOC_BYTES:
        raise BusinessRuleError(
            "documento_demasiado_grande",
            f"El archivo excede el máximo de {MAX_DOC_BYTES // (1024 * 1024)} MB",
        )

    payload = DocumentoCreate(
        tipo=tipo, nombre=nombre,
        vigencia_desde=vigencia_desde, vigencia_hasta=vigencia_hasta,
    )
    doc = service.create_for_cliente(
        cliente_id=cliente_id,
        payload=payload,
        content=content,
        content_type=file.content_type or "application/octet-stream",
        ext=ext,
        cargado_por=user.id,
    )
    return ok(service.to_response(doc), "Documento cargado")
