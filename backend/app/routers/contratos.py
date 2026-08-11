"""
Router de Contratos (Fase 4, ítems 50-51). Plan en `docs/PLAN_CONTRATOS.md`.

Dos caras y dos naturalezas: el **anverso** es la liquidación de este alquiler
puntual y se arma con datos vivos y editables; el **reverso** es el clausulado,
que vive versionado en `contrato_plantillas`.

`GET /contratos/preparar/{reserva_id}` devuelve el anverso precargado sin
persistir nada — lo que el operador corrige ahí es lo que se congela.
"""
import base64

from fastapi import (
    APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status,
)
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_db, get_current_user
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.responses import ok
from app.models.contrato import Contrato, ContratoPlantilla
from app.models.usuario import Usuario
from app.schemas.contrato import (
    AnularContratoRequest, ContratoCreate, ContratoPlantillaResponse,
    ContratoResponse, FirmarContratoRequest, NuevaPlantillaRequest,
)
from app.services.contrato_service import ContratoService

router = APIRouter(prefix="/contratos", tags=["Contratos"])


def _respuesta(c: Contrato) -> ContratoResponse:
    r = ContratoResponse.model_validate(c)
    r.numero_formateado = c.numero_formateado
    r.tiene_escaneo = bool(c.escaneo_key)
    return r


# ─── Plantillas del clausulado ───────────────────────────────────────────────
# Van antes que `/{contrato_id}` para que "plantillas" no se lea como un id.

@router.get("/plantillas")
def list_plantillas(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ContratoService(db)
    svc.plantilla_vigente()  # siembra la v1 si todavía no hay ninguna
    db.commit()
    items = (
        db.query(ContratoPlantilla)
        .filter(ContratoPlantilla.activo.is_(True))
        .order_by(ContratoPlantilla.version.desc())
        .all()
    )
    return ok([ContratoPlantillaResponse.model_validate(p) for p in items])


@router.post("/plantillas", status_code=status.HTTP_201_CREATED)
def crear_plantilla(
    payload: NuevaPlantillaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Publica una versión nueva. **Nunca edita la anterior.**"""
    plantilla = ContratoService(db).nueva_version(
        payload.titulo, payload.clausulas, current_user.id
    )
    db.commit()
    db.refresh(plantilla)
    return ok(ContratoPlantillaResponse.model_validate(plantilla), "Nueva versión publicada")


# ─── Emisión ─────────────────────────────────────────────────────────────────

@router.get("/preparar/{reserva_id}")
def preparar_contrato(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    El anverso precargado y editable. No persiste nada: lo que el operador
    corrija es lo que después se congela en el snapshot.
    """
    svc = ContratoService(db)
    try:
        datos = svc.preparar(reserva_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return ok({
        "snapshot": datos,
        # D-C1 sigue abierto: el contrato se puede emitir igual, pero avisa.
        "falta_datos_fiscales": svc.falta_datos_fiscales(),
    })


@router.post("", status_code=status.HTTP_201_CREATED)
def crear_contrato(
    payload: ContratoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ContratoService(db)
    try:
        contrato = svc.crear(payload.reserva_id, payload.snapshot, current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    db.refresh(contrato)
    return ok(_respuesta(contrato), "Contrato generado")


@router.post("/{contrato_id}/firmar")
def firmar_contrato(
    contrato_id: int,
    payload: FirmarContratoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Firma ológrafa digitalizada (no firma digital con certificado). Vale como
    prueba —es lo que usan todas las rentadoras— pero conviene no llamarla
    "firma digital" en ningún texto de la interfaz.
    """
    firma_bytes = None
    if payload.firma_base64:
        try:
            data = payload.firma_base64.split(",", 1)[-1]
            firma_bytes = base64.b64decode(data)
        except Exception:
            raise HTTPException(status_code=422, detail="La firma no es una imagen válida")

    svc = ContratoService(db)
    try:
        contrato = svc.firmar(
            contrato_id, firma_bytes, payload.nombre, payload.dni, current_user.id,
            medio=payload.firma_medio,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    db.refresh(contrato)
    return ok(_respuesta(contrato), "Contrato firmado")


# ─── Firma por link (D-C6) ───────────────────────────────────────────────────

@router.post("/{contrato_id}/link")
def generar_link_firma(
    contrato_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    El link que se le pasa al cliente para que firme desde el teléfono.

    Llamarlo dos veces **devuelve el mismo link** mientras siga vigente: quien
    aprieta el botón de nuevo casi siempre lo hace para volver a copiarlo, y
    regenerar el token dejaría muerto el que ya está en el WhatsApp del cliente.
    """
    svc = ContratoService(db)
    try:
        contrato = svc.generar_link(contrato_id, settings.web_url)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    db.refresh(contrato)

    return ok({
        "url": contrato.link_prellenado,
        "expira": contrato.firma_token_expira,
        # El texto listo para pegar en WhatsApp. Que lo arme el backend evita
        # que cada pantalla lo redacte distinto.
        "mensaje": _mensaje_whatsapp(contrato),
    }, "Link de firma generado")


def _mensaje_whatsapp(contrato) -> str:
    snap = contrato.snapshot or {}
    nombre = ((snap.get("cliente") or {}).get("nombre") or "").split(",")[0].strip()
    marca = (snap.get("empresa") or {}).get("nombre_comercial") or "Ubicar Rent"
    saludo = f"Hola {nombre.title()}! " if nombre else "Hola! "
    return (
        f"{saludo}Te paso el contrato de alquiler para que lo leas y lo firmes "
        f"desde el celular:\n\n{contrato.link_prellenado}\n\n"
        f"Cualquier duda, respondé por acá. — {marca}"
    )


@router.delete("/{contrato_id}/link")
def revocar_link_firma(
    contrato_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Mata el link. Para cuando se mandó a la persona equivocada, o el cliente
    prefirió firmar en el mostrador. **No deshace una firma ya hecha.**
    """
    svc = ContratoService(db)
    try:
        contrato = svc.revocar_link(contrato_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    db.commit()
    db.refresh(contrato)
    return ok(_respuesta(contrato), "Link revocado")


# ─── Escaneo del ejemplar firmado en papel ───────────────────────────────────

@router.post("/{contrato_id}/escaneo")
async def subir_escaneo(
    contrato_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Adjunta la foto o el escaneo del contrato firmado a mano.

    Es la pata que faltaba del camino en papel: marcarlo como firmado ya se
    podía, pero el ejemplar con la firma quedaba sólo en una carpeta y el
    sistema no tenía con qué respaldar lo que afirmaba.
    """
    contenido = await archivo.read()
    if len(contenido) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="El archivo supera los 10 MB. Sacá la foto en menor calidad o subí el PDF.",
        )

    svc = ContratoService(db)
    try:
        contrato = svc.adjuntar_escaneo(
            contrato_id, contenido, archivo.content_type or "application/octet-stream"
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    db.refresh(contrato)
    return ok(_respuesta(contrato), "Contrato firmado adjuntado")


@router.get("/{contrato_id}/escaneo")
def descargar_escaneo(
    contrato_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    from app.core.deps import get_storage

    contrato = ContratoService(db).get(contrato_id)
    if not contrato.escaneo_key:
        raise HTTPException(status_code=404, detail="Este contrato no tiene el papel adjuntado")
    try:
        contenido = get_storage().read(contrato.escaneo_key)
    except Exception:
        raise HTTPException(
            status_code=404,
            detail="El archivo ya no está disponible. Volvé a subirlo.",
        )

    extension = contrato.escaneo_key.rsplit(".", 1)[-1].lower()
    tipos = {
        "pdf": "application/pdf", "jpg": "image/jpeg",
        "png": "image/png", "webp": "image/webp",
    }
    return Response(
        content=contenido,
        media_type=tipos.get(extension, "application/octet-stream"),
        headers={
            "Content-Disposition":
                f'inline; filename="firmado_{contrato.numero_formateado}.{extension}"'
        },
    )


@router.post("/{contrato_id}/anular")
def anular_contrato(
    contrato_id: int,
    payload: AnularContratoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Anula el papel. **Nunca se borra**: un contrato emitido existió."""
    svc = ContratoService(db)
    try:
        contrato = svc.anular(contrato_id, payload.motivo, current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    db.refresh(contrato)
    return ok(_respuesta(contrato), "Contrato anulado")


# ─── Lectura ─────────────────────────────────────────────────────────────────

@router.get("")
def list_contratos(
    reserva_id: int | None = Query(None),
    alquiler_id: int | None = Query(None),
    solo_vigentes: bool = Query(True),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Contrato)
    if reserva_id is not None:
        q = q.filter(Contrato.reserva_id == reserva_id)
    if alquiler_id is not None:
        q = q.filter(Contrato.alquiler_id == alquiler_id)
    if solo_vigentes:
        q = q.filter(Contrato.anulado.is_(False))
    items = q.order_by(Contrato.id.desc()).all()
    return ok([_respuesta(c) for c in items])


@router.get("/{contrato_id}")
def get_contrato(
    contrato_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    try:
        contrato = ContratoService(db).get(contrato_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(_respuesta(contrato))


@router.get("/{contrato_id}/pdf")
def descargar_pdf(
    contrato_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ContratoService(db)
    try:
        contrato = svc.get(contrato_id)
        pdf = svc.generar_pdf(contrato_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    nombre = f"contrato_{contrato.numero_formateado}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )
