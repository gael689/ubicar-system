from __future__ import annotations
"""
Router de Alquileres — Fase 3 completo.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import ConflictError, NotFoundError, BusinessRuleError
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.alquiler import (
    CheckinCreate,
    ExtenderRequest,
    ExtenderResponse,
    AlquilerResponse,
    PreviewExcedenteResponse,
)
from app.services.alquiler_service import AlquilerService
from app.services.email_service import EmailService
from app.domain.tarifas import calcular_duracion_dias

router = APIRouter(prefix="/alquileres", tags=["Alquileres"])


def _parse_conflicto(exc: ConflictError) -> dict:
    parts = str(exc).split("|")
    code = parts[0] if parts else "error"
    message = parts[1] if len(parts) > 1 else str(exc)
    detail: dict = {"code": code, "message": message}
    if code == "solapamiento_extension" and len(parts) >= 6:
        detail["conflicto"] = {
            "reserva_id": int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None,
            "cliente_nombre": parts[3] if len(parts) > 3 else "",
            "fecha_inicio": parts[4] if len(parts) > 4 else "",
            "fecha_fin": parts[5] if len(parts) > 5 else "",
        }
    return detail


@router.get("")
def list_alquileres(
    vehiculo_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    con_checkin_pendiente: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = AlquilerService(db)
    items, total = svc.list(
        vehiculo_id=vehiculo_id,
        cliente_id=cliente_id,
        con_checkin_pendiente=con_checkin_pendiente,
        page=page,
        page_size=page_size,
    )
    return paginated(
        data=[AlquilerResponse.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{alquiler_id}")
def get_alquiler(
    alquiler_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = AlquilerService(db)
    try:
        alquiler = svc.get(alquiler_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(AlquilerResponse.model_validate(alquiler))


@router.get("/{alquiler_id}/preview-excedente")
def preview_excedente(
    alquiler_id: int,
    checkin_fecha: date = Query(...),
    checkin_hora: str = Query(..., description="HH:MM"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Preview del excedente calculado para una fecha/hora de checkin propuesta.
    No persiste nada. Usado para preview en vivo en el formulario de checkin.
    """
    from datetime import time as time_type
    try:
        hora_parts = checkin_hora.split(":")
        hora = time_type(int(hora_parts[0]), int(hora_parts[1]))
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail="Formato de hora inválido (use HH:MM)")

    svc = AlquilerService(db)
    try:
        resultado = svc.preview_excedente(alquiler_id, checkin_fecha, hora)
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok(PreviewExcedenteResponse(
        horas_excedidas=resultado.horas_excedidas,
        minutos_excedidos_brutos=resultado.minutos_excedidos_brutos,
        tarifa_diaria=resultado.tarifa_diaria,
        tarifa_hora_excedente=resultado.tarifa_hora_excedente,
        cargo_sugerido=resultado.cargo_sugerido,
        aplica_dia_completo=resultado.aplica_dia_completo,
        dias_completos_cobrados=resultado.dias_completos_cobrados,
        dentro_de_gracia=resultado.dentro_de_gracia,
    ))


@router.post("/{alquiler_id}/checkin")
def checkin(
    alquiler_id: int,
    payload: CheckinCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Registra el checkin con la decisión granular de cobro de excedente (D6).
    """
    svc = AlquilerService(db)
    try:
        alquiler = svc.checkin(
            alquiler_id=alquiler_id,
            checkin_fecha=payload.checkin_fecha,
            checkin_hora=payload.checkin_hora,
            checkin_km=payload.checkin_km,
            checkin_combustible=payload.checkin_combustible,
            checkin_descripcion=payload.checkin_descripcion,
            decision_excedente=payload.decision_excedente,
            usuario_id=current_user.id,
            horas_a_cobrar=payload.horas_a_cobrar,
            monto_manual=payload.monto_manual,
            motivo_bonificacion=payload.motivo_bonificacion,
            registrado_en_tiempo_real=payload.registrado_en_tiempo_real,
            checkin_estado_limpieza=payload.checkin_estado_limpieza,
            garantia_estado=payload.garantia_estado,
            garantia_monto_devuelto=payload.garantia_monto_devuelto,
            pago_inmediato=payload.pago_inmediato,
            cargo_combustible=payload.cargo_combustible,
            cargo_limpieza=payload.cargo_limpieza,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    # El cierre al cliente, con los cargos si los hubo. Después del commit: el
    # auto ya volvió, y ninguna falla de Resend puede devolver un error acá.
    EmailService.avisar(db, "checkin", alquiler)

    return ok(AlquilerResponse.model_validate(alquiler), "Checkin registrado")


@router.patch("/{alquiler_id}/extender")
def extender_alquiler(
    alquiler_id: int,
    payload: ExtenderRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """D11: Extiende un alquiler activo a una nueva fecha de fin."""
    svc = AlquilerService(db)
    try:
        alquiler_antes = svc.get(alquiler_id)
        fecha_fin_anterior = alquiler_antes.reserva.fecha_fin
        duracion_anterior = calcular_duracion_dias(
            alquiler_antes.reserva.fecha_inicio, fecha_fin_anterior
        )
        precio_anterior = alquiler_antes.reserva.precio_total

        alquiler = svc.extender(
            alquiler_id=alquiler_id,
            nueva_fecha_fin=payload.nueva_fecha_fin,
            nueva_hora_fin=payload.nueva_hora_fin,
            usuario_id=current_user.id,
            precio_manual=payload.precio_total,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    duracion_nueva = calcular_duracion_dias(
        alquiler.reserva.fecha_inicio, alquiler.reserva.fecha_fin
    )
    precio_nuevo = alquiler.reserva.precio_total
    diferencia = None
    if precio_nuevo is not None and precio_anterior is not None:
        diferencia = precio_nuevo - precio_anterior

    return ok(
        ExtenderResponse(
            alquiler_id=alquiler_id,
            fecha_fin_anterior=fecha_fin_anterior,
            fecha_fin_nueva=alquiler.reserva.fecha_fin,
            duracion_dias_anterior=duracion_anterior,
            duracion_dias_nueva=duracion_nueva,
            precio_anterior=precio_anterior,
            precio_nuevo=precio_nuevo,
            diferencia=diferencia,
        ).model_dump(),
        "Alquiler extendido",
    )
