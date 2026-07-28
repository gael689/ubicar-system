from __future__ import annotations
"""
Router de Ocupación — endpoint del calendario.
GET /api/v1/ocupacion — devuelve vehículos + eventos para el timeline.
"""
from datetime import date, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.services.reserva_service import MOTIVO_BLOQUEO_LABEL
from app.repositories.reserva_repo import ReservaRepo
from app.schemas.ocupacion import OcupacionResponse, VehiculoOcupacionItem, EventoOcupacion

router = APIRouter(prefix="/ocupacion", tags=["Ocupación"])


@router.get("")
def get_ocupacion(
    fecha_inicio: date = Query(...),
    fecha_fin: date = Query(...),
    vehiculo_ids: list[int] | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Devuelve la estructura de ocupación para el calendario.
    Incluye vehículos activos y sus reservas/alquileres en el rango de fechas.
    """
    # Vehículos activos
    q = db.query(Vehiculo).filter(Vehiculo.activo == True)
    if vehiculo_ids:
        q = q.filter(Vehiculo.id.in_(vehiculo_ids))
    vehiculos = q.order_by(Vehiculo.patente).all()
    vehiculo_ids_activos = [v.id for v in vehiculos]

    # Sincronizar estados antes de consultar ocupación
    from app.services.reserva_service import ReservaService
    ReservaService(db).sincronizar_estados_por_horario()

    # Reservas en el rango
    reserva_repo = ReservaRepo(db)
    reservas = reserva_repo.find_para_ocupacion(fecha_inicio, fecha_fin, vehiculo_ids_activos)

    eventos: list[EventoOcupacion] = []
    for r in reservas:
        eventos.append(EventoOcupacion(
            id=r.id,
            vehiculo_id=r.vehiculo_id,
            tipo="reserva",
            estado=r.estado,
            fecha_inicio=r.fecha_inicio,
            hora_inicio=r.hora_inicio,
            fecha_fin=r.fecha_fin,
            hora_fin=r.hora_fin,
            cliente_nombre=r.cliente.nombre_completo if r.cliente else "",
            lugar_entrega=r.lugar_entrega,
            lugar_devolucion=r.lugar_devolucion,
            precio_total=float(r.precio_total) if r.precio_total else None,
            notas=r.notas,
            tiene_alquiler=r.alquiler is not None,
        ))

    # Bloqueos (mantenimiento, siniestro, uso interno). Van al calendario
    # porque ocupan el vehículo igual que una reserva: si el auto está en el
    # taller la semana que viene, eso cambia cómo se planifica la flota, y no
    # verlo es exactamente lo que lleva a prometer un auto que no está.
    bloqueos = (
        db.query(BloqueoVehiculo)
        .filter(
            BloqueoVehiculo.activo.is_(True),
            BloqueoVehiculo.vehiculo_id.in_(vehiculo_ids_activos),
            BloqueoVehiculo.fecha_desde <= fecha_fin,
            BloqueoVehiculo.fecha_hasta >= fecha_inicio,
        )
        .all()
    )
    for b in bloqueos:
        eventos.append(EventoOcupacion(
            id=b.id,
            vehiculo_id=b.vehiculo_id,
            tipo="bloqueo",
            estado=b.motivo,
            fecha_inicio=b.fecha_desde,
            hora_inicio=time.min,
            # El rango del bloqueo es inclusivo, así que ocupa el último día
            # completo — de ahí el 23:59.
            fecha_fin=b.fecha_hasta,
            hora_fin=time(23, 59),
            cliente_nombre=MOTIVO_BLOQUEO_LABEL.get(b.motivo, b.motivo),
            notas=b.notas,
        ))

    return ok(OcupacionResponse(
        vehiculos=[VehiculoOcupacionItem.model_validate(v) for v in vehiculos],
        eventos=eventos,
    ))
