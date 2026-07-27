from __future__ import annotations
"""
Router de Reservas — Fase 3 completo.
"""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import ConflictError, NotFoundError, BusinessRuleError
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.alquiler import CheckoutCreate, AlquilerResponse
from app.schemas.reserva import (
    ReservaCreate,
    ReservaUpdate,
    ReservaResponse,
    ReasignarRequest,
    CancelarReservaRequest,
    SolapeWarning,
    BloqueoItemResponse,
    SemaforoResponse,
)
from app.services.reserva_service import ReservaService
from app.services.alquiler_service import AlquilerService

router = APIRouter(prefix="/reservas", tags=["Reservas"])


def _parse_conflicto(exc: ConflictError) -> dict:
    """Parsea el mensaje de ConflictError estructurado con | como separador."""
    parts = str(exc).split("|")
    code = parts[0] if parts else "error"
    message = parts[1] if len(parts) > 1 else str(exc)
    detail: dict = {"code": code, "message": message}

    if code == "solapamiento" and len(parts) >= 5:
        detail["conflicto"] = {
            "reserva_id": int(parts[2]) if parts[2].isdigit() else None,
            "estado": parts[3],
            "fecha_inicio": parts[4],
            "fecha_fin": parts[5] if len(parts) > 5 else "",
        }
    elif code == "solapamiento_extension" and len(parts) >= 6:
        detail["conflicto"] = {
            "reserva_id": int(parts[2]) if parts[2].isdigit() else None,
            "cliente_nombre": parts[3],
            "fecha_inicio": parts[4],
            "fecha_fin": parts[5],
        }
    return detail


# ─────────────────────────────────────────────────────────────────────────────
# CRUD Reservas
# ─────────────────────────────────────────────────────────────────────────────

@router.get("")
def list_reservas(
    estado: str | None = Query(None),
    vehiculo_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    q: str | None = Query(None, description="Buscar por nombre o DNI/CUIT del cliente"),
    fecha: date | None = Query(None, description="Filtrar reservas activas en un día específico"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    items, total = svc.list(
        estado=estado,
        vehiculo_id=vehiculo_id,
        cliente_id=cliente_id,
        q=q,
        fecha=fecha,
        page=page,
        page_size=page_size,
    )
    return paginated(
        data=[ReservaResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_reserva(
    payload: ReservaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        reserva, warnings = svc.create(
            vehiculo_id=payload.vehiculo_id,
            cliente_id=payload.cliente_id,
            conductor_id=payload.conductor_id,
            fecha_inicio=payload.fecha_inicio,
            hora_inicio=payload.hora_inicio,
            fecha_fin=payload.fecha_fin,
            hora_fin=payload.hora_fin,
            lugar_entrega=payload.lugar_entrega,
            lugar_devolucion=payload.lugar_devolucion,
            notas=payload.notas,
            hora_devolucion_acordada=payload.hora_devolucion_acordada,
            late_checkout=payload.late_checkout,
            cargo_late_checkout=payload.cargo_late_checkout,
            precio_total=payload.precio_total,
            garantia_tipo=payload.garantia_tipo,
            garantia_monto=payload.garantia_monto,
            garantia_tarjeta_numero=payload.garantia_tarjeta_numero,
            garantia_tarjeta_vencimiento=payload.garantia_tarjeta_vencimiento,
            garantia_tarjeta_titular=payload.garantia_tarjeta_titular,
            forma_pago_prevista=payload.forma_pago_prevista,
            estado_pago=payload.estado_pago,
            anticipo_monto=payload.anticipo_monto,
            anticipo_fecha=payload.anticipo_fecha,
            anticipo_medio_pago=payload.anticipo_medio_pago,
            con_factura=payload.con_factura,
            descuento_motivo=payload.descuento_motivo,
            usuario_id=current_user.id,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok(
        {
            **ReservaResponse.model_validate(reserva).model_dump(),
            "warnings": warnings,
        },
        "Reserva creada"
    )


@router.get("/a-reasignar")
def list_reservas_a_reasignar(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Vista D4: reservas de vehículos inactivos que necesitan reasignación."""
    svc = ReservaService(db)
    items = svc.get_reservas_a_reasignar()
    return ok([ReservaResponse.model_validate(r) for r in items])


@router.get("/{reserva_id}")
def get_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        reserva = svc.get(reserva_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(ReservaResponse.model_validate(reserva))


@router.get("/{reserva_id}/pre-checkout")
def pre_checkout(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Semáforo previo al check-out (Fase 3, ítem 39): adelanta lo que
    checkout() va a advertir/bloquear, sin tener que abrir el modal.
    Ver domain/bloqueos.py — la mayoría son advertencias informativas."""
    from app.domain.bloqueos import evaluar_pre_checkout

    svc = ReservaService(db)
    try:
        reserva = svc.get(reserva_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    semaforo, items = evaluar_pre_checkout(db, reserva)
    return ok(SemaforoResponse(semaforo=semaforo, items=[BloqueoItemResponse(**i.__dict__) for i in items]).model_dump())


@router.get("/{reserva_id}/pre-checkin")
def pre_checkin(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Semáforo previo al check-in (Fase 3, ítem 39). Requiere que la
    reserva ya tenga un alquiler (checkout hecho)."""
    from app.domain.bloqueos import evaluar_pre_checkin

    svc = ReservaService(db)
    try:
        reserva = svc.get(reserva_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not reserva.alquiler:
        raise HTTPException(status_code=422, detail="Esta reserva todavía no tiene checkout registrado")
    semaforo, items = evaluar_pre_checkin(db, reserva.alquiler)
    return ok(SemaforoResponse(semaforo=semaforo, items=[BloqueoItemResponse(**i.__dict__) for i in items]).model_dump())


@router.patch("/{reserva_id}")
def update_reserva(
    reserva_id: int,
    payload: ReservaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        reserva, warnings = svc.update(
            id=reserva_id,
            usuario_id=current_user.id,
            **payload.model_dump(exclude_none=True),
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok(
        {**ReservaResponse.model_validate(reserva).model_dump(), "warnings": warnings},
        "Reserva actualizada",
    )


@router.post("/{reserva_id}/confirmar")
def confirmar_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        reserva = svc.confirmar(reserva_id, current_user.id)
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(ReservaResponse.model_validate(reserva), "Reserva confirmada")


@router.post("/{reserva_id}/cancelar")
def cancelar_reserva(
    reserva_id: int,
    payload: CancelarReservaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """D-11: la seña no se devuelve, motivo obligatorio."""
    svc = ReservaService(db)
    try:
        reserva = svc.cancelar(reserva_id, current_user.id, payload.motivo)
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ok(ReservaResponse.model_validate(reserva), "Reserva cancelada")


@router.post("/{reserva_id}/reasignar")
def reasignar_reserva(
    reserva_id: int,
    payload: ReasignarRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """D4: Reasigna una reserva a otro vehículo."""
    svc = ReservaService(db)
    try:
        reserva, warnings = svc.reasignar(reserva_id, payload.vehiculo_id_nuevo, current_user.id)
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(
        {**ReservaResponse.model_validate(reserva).model_dump(), "warnings": warnings},
        "Reserva reasignada",
    )


@router.post("/{reserva_id}/checkout", status_code=status.HTTP_201_CREATED)
def checkout(
    reserva_id: int,
    payload: CheckoutCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Inicia el checkout de una reserva confirmada."""
    svc = AlquilerService(db)
    try:
        alquiler, warnings = svc.checkout(
            reserva_id=reserva_id,
            checkout_fecha=payload.checkout_fecha,
            checkout_hora=payload.checkout_hora,
            checkout_km=payload.checkout_km,
            checkout_combustible=payload.checkout_combustible,
            checkout_descripcion=payload.checkout_descripcion,
            usuario_id=current_user.id,
            registrado_en_tiempo_real=payload.registrado_en_tiempo_real,
            checkout_estado_limpieza=payload.checkout_estado_limpieza,
            garantia_tipo=payload.garantia_tipo,
            garantia_monto=payload.garantia_monto,
            pago_inmediato=payload.pago_inmediato,
            cargo_checkout_tardio=payload.cargo_checkout_tardio,
            motivo_checkout_tardio=payload.motivo_checkout_tardio,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ok(
        {**AlquilerResponse.model_validate(alquiler).model_dump(), "warnings": warnings},
        "Checkout registrado",
    )
