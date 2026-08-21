"""
Parte de daños del vehículo (Fase 4, ítems 52-53).

Las fotos reutilizan el mismo `IStorage` que Documentos y Comprobantes, así
que funcionan igual con almacenamiento local hoy y con R2 cuando se migre.
"""
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.deps import get_current_user, get_db, get_storage
from app.core.exceptions import BusinessRuleError
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.danio import Danio
from app.schemas.danio import (
    DanioCreate, DanioUpdate, DanioResponse,
    ImputarDanioRequest,
    CobrarDanioRequest, BonificarDanioRequest,
)
from app.services.danio_service import DanioService

router = APIRouter(prefix="/danios", tags=["Daños"])

ALLOWED_FOTO_EXT = {"jpg", "jpeg", "png", "webp", "heic"}
MAX_FOTO_BYTES = 10 * 1024 * 1024  # 10 MB


def _service(db: Session = Depends(get_db)) -> DanioService:
    return DanioService(db)


def _to_response(danio: Danio, storage: IStorage) -> dict:
    data = DanioResponse.model_validate(danio).model_dump()
    data["vehiculo_patente"] = danio.vehiculo.patente if danio.vehiculo else None
    data["cliente_nombre"] = danio.cliente.nombre_completo if danio.cliente else None
    for foto in data.get("fotos", []):
        foto["url"] = storage.public_url(foto["archivo_key"])
    return data


@router.get("")
def list_danios(
    vehiculo_id: int | None = Query(None),
    alquiler_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    estado: str | None = Query(None),
    incluir_inactivos: bool = Query(False),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    items = svc.listar(
        vehiculo_id=vehiculo_id,
        alquiler_id=alquiler_id,
        cliente_id=cliente_id,
        estado=estado,
        incluir_inactivos=incluir_inactivos,
    )
    return ok([_to_response(d, storage) for d in items])


@router.get("/preexistentes/{vehiculo_id}")
def preexistentes(
    vehiculo_id: int,
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    """
    Daños vigentes del vehículo — lo que hay que mostrarle al operador antes
    de entregarlo, para no imputarle a un cliente algo que ya estaba.
    """
    items = svc.preexistentes_de(vehiculo_id)
    return ok([_to_response(d, storage) for d in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_danio(
    payload: DanioCreate,
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    current_user: Usuario = Depends(get_current_user),
):
    danio = svc.registrar(payload, usuario_id=current_user.id)
    db.commit()
    db.refresh(danio)
    return ok(_to_response(danio, storage), "Daño registrado")


@router.patch("/{danio_id}")
def update_danio(
    danio_id: int,
    payload: DanioUpdate,
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    danio = svc.actualizar(danio_id, payload)
    db.commit()
    db.refresh(danio)
    return ok(_to_response(danio, storage), "Daño actualizado")


@router.post("/{danio_id}/imputar")
def imputar_danio(
    danio_id: int,
    payload: ImputarDanioRequest,
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    current_user: Usuario = Depends(get_current_user),
):
    """Le cobra el daño al cliente: genera el débito en su cuenta corriente."""
    danio = svc.imputar(
        danio_id,
        Decimal(str(payload.monto)),
        usuario_id=current_user.id,
        cliente_id=payload.cliente_id,
        concepto=payload.concepto,
    )
    db.commit()
    db.refresh(danio)
    return ok(_to_response(danio, storage), "Daño imputado al cliente")


@router.post("/{danio_id}/cobrar")
def cobrar_danio(
    danio_id: int,
    payload: CobrarDanioRequest,
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    current_user: Usuario = Depends(get_current_user),
):
    """
    El cliente pagó el daño imputado.

    Crea el `Pago` —que lo hace entrar a la caja del día, con su medio— y el
    crédito que cancela el débito, en un solo acto. Falla si ya había un
    crédito vivo para este daño: no se cobra dos veces
    (`PLAN_DINERO.md` §1.4).

    El daño **sigue imputado**: cobrarlo no lo repara, y tiene que seguir
    apareciendo como preexistente en el próximo check-out.
    """
    danio = svc.cobrar(
        danio_id,
        usuario_id=current_user.id,
        medio_pago=payload.medio_pago,
        fecha_cobro=payload.fecha_cobro,
    )
    db.commit()
    db.refresh(danio)
    return ok(_to_response(danio, storage), "Daño cobrado")


@router.post("/{danio_id}/bonificar")
def bonificar_danio(
    danio_id: int,
    payload: BonificarDanioRequest,
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    current_user: Usuario = Depends(get_current_user),
):
    """Se le perdona el daño. Si estaba imputado, revierte el débito."""
    danio = svc.bonificar(danio_id, payload.motivo, usuario_id=current_user.id)
    db.commit()
    db.refresh(danio)
    return ok(_to_response(danio, storage), "Daño bonificado")


@router.delete("/{danio_id}")
def deactivate_danio(
    danio_id: int,
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    """Baja lógica. NUNCA borra el registro."""
    danio = svc.dar_de_baja(danio_id)
    db.commit()
    db.refresh(danio)
    return ok(_to_response(danio, storage), "Daño dado de baja")


# ── Fotos ─────────────────────────────────────────────────────────────────────

@router.post("/{danio_id}/fotos", status_code=status.HTTP_201_CREATED)
async def upload_foto(
    danio_id: int,
    descripcion: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    current_user: Usuario = Depends(get_current_user),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_FOTO_EXT:
        raise BusinessRuleError(
            "foto_extension_invalida",
            f"Extensión '{ext}' no permitida. Usar: {', '.join(sorted(ALLOWED_FOTO_EXT))}",
        )
    content = await file.read()
    if len(content) > MAX_FOTO_BYTES:
        raise BusinessRuleError(
            "foto_demasiado_grande",
            f"La foto excede el máximo de {MAX_FOTO_BYTES // (1024 * 1024)} MB",
        )

    danio = svc.get(danio_id)
    key = f"vehiculos/{danio.vehiculo_id}/danios/{danio_id}-{uuid4().hex[:8]}.{ext}"
    storage.upload(key, content, file.content_type or "application/octet-stream")
    svc.agregar_foto(danio_id, key, descripcion, usuario_id=current_user.id)

    db.commit()
    danio = svc.get(danio_id)
    return ok(_to_response(danio, storage), "Foto cargada")


@router.delete("/fotos/{foto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_foto(
    foto_id: int,
    db: Session = Depends(get_db),
    svc: DanioService = Depends(_service),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    """
    Las fotos sí se borran de verdad: son un adjunto, no una entidad de
    dominio — la regla de "nunca eliminar" aplica al daño, que queda intacto.
    """
    foto = svc.get_foto(foto_id)
    storage.delete(foto.archivo_key)
    db.delete(foto)
    db.commit()
    return None
