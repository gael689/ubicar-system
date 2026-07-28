from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.deps import get_current_user, get_db, get_storage
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.documento import DocumentoResponse
from app.schemas.gasto import GastoResponse
from app.schemas.historial import HistorialVehiculoResponse
from app.schemas.tarifa import TarifaResponse
from app.schemas.vehiculo import (
    EstadoVehiculo,
    TipoVehiculo,
    VehiculoCreate,
    VehiculoUpdate,
    VehiculoReorderRequest,
)
from app.services.documento_service import DocumentoService
from app.services.gasto_service import GastoService
from app.services.tarifa_service import TarifaService
from app.services.vehiculo_service import VehiculoService


class InactivarBody(BaseModel):
    confirmacion: bool = False

router = APIRouter(prefix="/vehiculos", tags=["Vehículos"])

ALLOWED_FOTO_EXT = {"jpg", "jpeg", "png", "webp"}
MAX_FOTO_BYTES = 5 * 1024 * 1024  # 5 MB


def _service(
    db: Session = Depends(get_db),
    storage: IStorage = Depends(get_storage),
) -> VehiculoService:
    return VehiculoService(db, storage)


@router.get("")
def list_vehiculos(
    estado: EstadoVehiculo | None = Query(None),
    tipo: TipoVehiculo | None = Query(None),
    q: str | None = Query(None, description="Búsqueda en patente, marca y modelo"),
    incluir_inactivos: bool = Query(False, description="Si true, muestra también los dados de baja"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    items, total = service.list(
        estado=estado, tipo=tipo, q=q,
        incluir_inactivos=incluir_inactivos,
        page=page, page_size=page_size,
    )
    return paginated(
        data=[service.to_response(v) for v in items],
        total=total, page=page, page_size=page_size,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_vehiculo(
    payload: VehiculoCreate,
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    vehiculo = service.create(payload)
    return ok(service.to_response(vehiculo), "Vehículo creado")


@router.get("/{vehiculo_id}")
def get_vehiculo(
    vehiculo_id: int,
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    vehiculo = service.get(vehiculo_id)
    return ok(service.to_response(vehiculo))


@router.patch("/{vehiculo_id}")
def update_vehiculo(
    vehiculo_id: int,
    payload: VehiculoUpdate,
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    vehiculo = service.update(vehiculo_id, payload)
    return ok(service.to_response(vehiculo), "Vehículo actualizado")


@router.delete("/{vehiculo_id}")
def deactivate_vehiculo(
    vehiculo_id: int,
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """
    Baja lógica. NUNCA elimina el registro. Reversible con
    `POST /vehiculos/{id}/reactivar`.

    Devuelve 409 si el vehículo tiene reservas sin cerrar. Para darlo de baja
    igual está `PATCH /vehiculos/{id}/inactivar`, que pide confirmación y deja
    ver antes qué reservas quedan afectadas.
    """
    vehiculo = service.deactivate(vehiculo_id)
    return ok(service.to_response(vehiculo), "Vehículo dado de baja")


@router.put("/reorder")
def reorder_vehiculos(
    payload: VehiculoReorderRequest,
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    service.reorder(payload)
    return ok(None, "Vehículos reordenados")


@router.post("/{vehiculo_id}/reactivar")
def reactivate_vehiculo(
    vehiculo_id: int,
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    vehiculo = service.reactivate(vehiculo_id)
    return ok(service.to_response(vehiculo), "Vehículo reactivado")


def _historial_alquileres(db: Session, vehiculo_id: int) -> list[dict]:
    """
    Los alquileres de un vehículo, del más reciente al más viejo.

    Se devuelve plano y resumido a propósito: es una línea de tiempo para
    leer, no un listado para operar. Quien necesite el detalle entra a la
    reserva.
    """
    from app.models.alquiler import Alquiler
    from app.models.reserva import Reserva

    filas = (
        db.query(Alquiler, Reserva)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Reserva.vehiculo_id == vehiculo_id)
        .order_by(Alquiler.checkout_fecha.desc(), Alquiler.id.desc())
        .all()
    )
    return [
        {
            "alquiler_id": a.id,
            "reserva_id": r.id,
            "cliente": r.cliente.nombre_completo if r.cliente else None,
            "checkout_fecha": a.checkout_fecha.isoformat() if a.checkout_fecha else None,
            "checkin_fecha": a.checkin_fecha.isoformat() if a.checkin_fecha else None,
            "checkout_km": a.checkout_km,
            "checkin_km": a.checkin_km,
            # Cuánto rodó en ese alquiler: es el dato que se busca acá y
            # calcularlo a mano en el frontend invita a que dos pantallas den
            # números distintos.
            "km_recorridos": (
                a.checkin_km - a.checkout_km
                if a.checkin_km is not None and a.checkout_km is not None
                else None
            ),
            "en_curso": a.checkin_fecha is None,
        }
        for a, r in filas
    ]


@router.get("/{vehiculo_id}/historial")
def get_historial(
    vehiculo_id: int,
    service: VehiculoService = Depends(_service),
    db: Session = Depends(get_db),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    """
    Historial completo del vehículo (visible incluso si está inactivo).
    Gastos, documentos, tarifas y **alquileres**.

    Los alquileres llegaron último y por una razón: es el historial que
    contesta "¿cuánto trabajó este auto?" cuando hay que decidir si conviene
    venderlo. Estuvo devolviendo `[]` desde F1.
    """
    # Valida que el vehículo exista (404 si no).
    service.get(vehiculo_id)

    gasto_service = GastoService(db)
    documento_service = DocumentoService(db, storage)
    tarifa_service = TarifaService(db)

    gastos, _total = gasto_service.list(vehiculo_id, page=1, page_size=100)
    documentos = documento_service.list(vehiculo_id)
    tarifas = tarifa_service.list(vehiculo_id, incluir_inactivas=True)

    payload = HistorialVehiculoResponse(
        vehiculo_id=vehiculo_id,
        gastos=[GastoResponse.model_validate(g) for g in gastos],
        documentos=[documento_service.to_response(d) for d in documentos],
        tarifas=[TarifaResponse.model_validate(t) for t in tarifas],
        alquileres=_historial_alquileres(db, vehiculo_id),
    )
    return ok(payload)


@router.get("/{vehiculo_id}/reservas-afectadas")
def get_reservas_afectadas(
    vehiculo_id: int,
    db: Session = Depends(get_db),
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """
    D4 Dry-run: lista reservas/alquileres que se verían afectados por inactivar el vehículo.
    No modifica nada.
    """
    service.get(vehiculo_id)  # 404 si no existe
    from app.services.reserva_service import ReservaService
    from app.schemas.reserva import ReservaResponse
    reserva_svc = ReservaService(db)
    afectadas = reserva_svc.get_reservas_afectadas_por_inactivacion(vehiculo_id)
    return ok({
        "vehiculo_id": vehiculo_id,
        "reservas_afectadas": [ReservaResponse.model_validate(r) for r in afectadas],
        "total": len(afectadas),
    })


@router.patch("/{vehiculo_id}/inactivar")
def inactivar_vehiculo(
    vehiculo_id: int,
    body: InactivarBody,
    db: Session = Depends(get_db),
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """
    D4: Inactiva el vehículo. Requiere confirmacion=true.
    Si hay reservas activas, el admin debe confirmar explícitamente.
    """
    if not body.confirmacion:
        raise HTTPException(
            status_code=400,
            detail="Se requiere confirmacion=true para inactivar el vehículo",
        )
    # `forzar=True`: acá la persona ya vio las reservas afectadas
    # (`GET /vehiculos/{id}/reservas-afectadas`) y confirmó igual. Este es el
    # camino para hacerlo a sabiendas; el DELETE es el que frena.
    vehiculo = service.deactivate(vehiculo_id, forzar=True)
    return ok(service.to_response(vehiculo), "Vehículo inactivado")


@router.post("/{vehiculo_id}/foto")
async def upload_foto(
    vehiculo_id: int,
    file: UploadFile = File(...),
    service: VehiculoService = Depends(_service),
    _: Usuario = Depends(get_current_user),
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
    vehiculo = service.upload_foto(vehiculo_id, content, file.content_type or "image/jpeg", ext)
    return ok(service.to_response(vehiculo), "Foto subida")

