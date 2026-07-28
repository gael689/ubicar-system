"""
Bloqueos de vehículo por fecha (Fase 5, ítem 59 — plan §7.3).

`Vehiculo.estado = fuera_de_servicio` dice "hoy no está" pero no tiene
fechas: no sirve para planificar ni para contestar "¿está libre del 3 al 10
de septiembre?". Un bloqueo es un rango, y por eso se puede cargar por
adelantado.

Los bloqueos rechazan reservas por el mismo camino que una reserva
confirmada — entran como una ventana más en `domain/solapamientos.py`
(ver `ReservaService._cargar_ventanas`).
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.reserva import Reserva
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.schemas.bloqueo_vehiculo import (
    BloqueoVehiculoCreate, BloqueoVehiculoResponse, BloqueoVehiculoUpdate,
)

router = APIRouter(prefix="/bloqueos", tags=["Bloqueos de vehículo"])

# Estados de reserva que realmente ocupan el vehículo — los mismos que usa
# domain/solapamientos.py, más "pendiente" (todavía no está confirmada pero
# alguien la está esperando).
ESTADOS_QUE_OCUPAN = ("pendiente", "confirmada", "activa", "vencida")


def _get(db: Session, bloqueo_id: int) -> BloqueoVehiculo:
    b = db.get(BloqueoVehiculo, bloqueo_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bloqueo no encontrado")
    return b


def _serializar(db: Session, b: BloqueoVehiculo) -> BloqueoVehiculoResponse:
    resp = BloqueoVehiculoResponse.model_validate(b)
    veh = db.get(Vehiculo, b.vehiculo_id)
    resp.vehiculo_patente = veh.patente if veh else None
    return resp


def _reservas_en_conflicto(
    db: Session, vehiculo_id: int, desde: date, hasta: date
) -> list[dict]:
    """
    Reservas que chocan con el rango del bloqueo.

    **No impiden crearlo**: el auto se rompe cuando se rompe, y el sistema no
    puede negarse a registrarlo porque haya una reserva cargada. Se devuelven
    como advertencia para que alguien reasigne el vehículo — mismo criterio
    que el resto del sistema: informa, no decide.
    """
    reservas = (
        db.query(Reserva)
        .filter(
            Reserva.vehiculo_id == vehiculo_id,
            Reserva.estado.in_(ESTADOS_QUE_OCUPAN),
            Reserva.fecha_inicio <= hasta,
            Reserva.fecha_fin >= desde,
        )
        .order_by(Reserva.fecha_inicio)
        .all()
    )
    return [
        {
            "id": r.id,
            "estado": r.estado,
            "cliente": r.cliente.nombre_completo if r.cliente else "",
            "fecha_inicio": str(r.fecha_inicio),
            "fecha_fin": str(r.fecha_fin),
        }
        for r in reservas
    ]


@router.get("")
def list_bloqueos(
    vehiculo_id: int | None = Query(None),
    desde: date | None = Query(None, description="Devuelve los que se solapan con el rango"),
    hasta: date | None = Query(None),
    motivo: str | None = Query(None),
    incluir_inactivos: bool = Query(False),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(BloqueoVehiculo)
    if not incluir_inactivos:
        q = q.filter(BloqueoVehiculo.activo.is_(True))
    if vehiculo_id is not None:
        q = q.filter(BloqueoVehiculo.vehiculo_id == vehiculo_id)
    if motivo:
        q = q.filter(BloqueoVehiculo.motivo == motivo)
    # Solapamiento de rangos, igual que en fechas especiales.
    if hasta:
        q = q.filter(BloqueoVehiculo.fecha_desde <= hasta)
    if desde:
        q = q.filter(BloqueoVehiculo.fecha_hasta >= desde)

    items = q.order_by(BloqueoVehiculo.fecha_desde).all()
    return ok([_serializar(db, b) for b in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_bloqueo(
    payload: BloqueoVehiculoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if db.get(Vehiculo, payload.vehiculo_id) is None:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")

    conflictos = _reservas_en_conflicto(
        db, payload.vehiculo_id, payload.fecha_desde, payload.fecha_hasta
    )

    b = BloqueoVehiculo(**payload.model_dump(), creado_por=current_user.id)
    db.add(b)
    db.commit()
    db.refresh(b)

    mensaje = "Bloqueo creado"
    if conflictos:
        mensaje = (
            f"Bloqueo creado — atención: hay {len(conflictos)} reserva(s) en ese rango "
            "que hay que reasignar"
        )
    return ok(
        {**_serializar(db, b).model_dump(), "reservas_en_conflicto": conflictos},
        mensaje,
    )


@router.get("/verificar")
def verificar_conflictos(
    vehiculo_id: int = Query(...),
    fecha_desde: date = Query(...),
    fecha_hasta: date = Query(...),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Qué reservas se verían afectadas por un bloqueo, **antes** de crearlo.
    Permite avisar en el formulario en vez de después del hecho.
    """
    if fecha_hasta < fecha_desde:
        raise HTTPException(status_code=422, detail="El rango de fechas está invertido")
    return ok(_reservas_en_conflicto(db, vehiculo_id, fecha_desde, fecha_hasta))


@router.patch("/{bloqueo_id}")
def update_bloqueo(
    bloqueo_id: int,
    payload: BloqueoVehiculoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    b = _get(db, bloqueo_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(b, campo, valor)
    if b.fecha_hasta < b.fecha_desde:
        raise HTTPException(
            status_code=422, detail="La fecha de fin no puede ser anterior a la de inicio"
        )
    db.commit()
    db.refresh(b)
    return ok(_serializar(db, b), "Bloqueo actualizado")


@router.delete("/{bloqueo_id}")
def deactivate_bloqueo(
    bloqueo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Baja lógica: libera el vehículo pero deja el registro.

    Importa para el historial del auto — cuántas veces estuvo en el taller y
    por cuánto tiempo es justamente lo que dice si conviene venderlo.
    """
    b = _get(db, bloqueo_id)
    b.activo = False
    db.commit()
    db.refresh(b)
    return ok(_serializar(db, b), "Bloqueo liberado")


@router.post("/{bloqueo_id}/reactivar")
def reactivate_bloqueo(
    bloqueo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    b = _get(db, bloqueo_id)
    b.activo = True
    db.commit()
    db.refresh(b)
    return ok(_serializar(db, b), "Bloqueo reactivado")
