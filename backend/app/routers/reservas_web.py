"""
Bandeja de Reservas Web (ítem 64).

Es donde el equipo ve lo que entró por la web y decide. Tres colas, que
corresponden a tres situaciones distintas:

- **`sin_disponibilidad`** — el cliente pidió una categoría agotada y dejó sus
  datos sin pagar (D-04). Es una venta a recuperar, no un error: hay que
  ofrecerle otra categoría u otras fechas.
- **`revision_sin_cupo`** — el pago entró pero el cupo se fue mientras tanto
  (decisión #4). Acá **sí hay plata del cliente en juego** y por eso la
  urgencia es otra.
- **`pendiente_pago`** — el hold está tomado y se espera a Mercado Pago. No
  requiere acción: se muestra para saber qué está en curso.

**Aceptar asigna un vehículo concreto**, que es el momento en que una reserva
por categoría vuelve a ser una reserva de un auto puntual.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.core.responses import ok
from app.domain.enums import EstadoReserva
from app.models.reserva import Reserva
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.schemas.reserva import ReservaResponse

router = APIRouter(prefix="/reservas-web", tags=["Reservas web"])

# Los estados que la bandeja muestra. `confirmada` queda afuera a propósito:
# una vez aceptada, la reserva vive en el listado normal — tener el mismo
# registro en dos bandejas es la forma más rápida de que alguien lo trabaje
# dos veces.
ESTADOS_BANDEJA = [
    EstadoReserva.SIN_DISPONIBILIDAD.value,
    EstadoReserva.REVISION_SIN_CUPO.value,
    EstadoReserva.PENDIENTE_PAGO.value,
]


class AceptarReservaWebRequest(BaseModel):
    # Aceptar es asignar un auto concreto: una categoría no se puede entregar.
    vehiculo_id: int
    notas: str | None = None


class RechazarReservaWebRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El motivo del rechazo es obligatorio")
        return v.strip()


def _get(db: Session, reserva_id: int) -> Reserva:
    reserva = db.get(Reserva, reserva_id)
    if not reserva:
        raise NotFoundError("Reserva", reserva_id)
    if reserva.origen != "web":
        raise BusinessRuleError(
            "no_es_reserva_web",
            "Esta reserva no entró por la web: se gestiona desde el listado normal",
        )
    return reserva


@router.get("")
def list_reservas_web(
    estado: str | None = Query(None),
    incluir_resueltas: bool = Query(False),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Reserva).filter(Reserva.origen == "web")
    if estado:
        q = q.filter(Reserva.estado == estado)
    elif not incluir_resueltas:
        q = q.filter(Reserva.estado.in_(ESTADOS_BANDEJA))

    items = q.order_by(Reserva.created_at.desc()).all()
    return ok([ReservaResponse.model_validate(r) for r in items])


@router.get("/resumen")
def resumen_bandeja(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Contadores para el badge del menú."""
    conteo = {
        e: db.query(Reserva)
        .filter(Reserva.origen == "web", Reserva.estado == e)
        .count()
        for e in ESTADOS_BANDEJA
    }
    return ok({
        "por_estado": conteo,
        # Lo que realmente requiere que alguien haga algo. `pendiente_pago`
        # no cuenta: está esperando al cliente, no a nosotros.
        "pendientes": (
            conteo[EstadoReserva.SIN_DISPONIBILIDAD.value]
            + conteo[EstadoReserva.REVISION_SIN_CUPO.value]
        ),
    })


@router.post("/{reserva_id}/aceptar")
def aceptar(
    reserva_id: int,
    payload: AceptarReservaWebRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Confirma la solicitud asignándole un vehículo.

    La disponibilidad se revalida al asignar —no se confía en lo que se vio al
    abrir la bandeja— porque entre que se listó y se aceptó pudo entrar otra
    reserva sobre el mismo auto.
    """
    from app.services.reserva_service import ReservaService

    try:
        reserva = _get(db, reserva_id)
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=404 if isinstance(e, NotFoundError) else 422, detail=str(e))

    if reserva.estado not in ESTADOS_BANDEJA:
        raise HTTPException(
            status_code=409,
            detail=f"La reserva ya fue resuelta (estado: {reserva.estado})",
        )

    vehiculo = db.get(Vehiculo, payload.vehiculo_id)
    if not vehiculo or not vehiculo.activo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")

    try:
        ReservaService(db).validar_disponibilidad_vehiculo(
            payload.vehiculo_id, reserva.fecha_inicio, reserva.hora_inicio,
            reserva.fecha_fin, reserva.hora_fin, excluir_reserva_id=reserva.id,
        )
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))

    reserva.vehiculo_id = payload.vehiculo_id
    reserva.estado = EstadoReserva.CONFIRMADA.value
    reserva.web_resuelta_por = current_user.id
    reserva.web_resuelta_en = datetime.utcnow()
    if payload.notas:
        reserva.notas = f"{reserva.notas}\n{payload.notas}" if reserva.notas else payload.notas
    db.commit()
    db.refresh(reserva)
    return ok(ReservaResponse.model_validate(reserva), "Reserva confirmada")


@router.post("/{reserva_id}/rechazar")
def rechazar(
    reserva_id: int,
    payload: RechazarReservaWebRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Rechaza la solicitud. **Nunca se borra**: el motivo es lo que después
    explica una devolución y lo que permite medir por qué se caen las ventas.

    ⚠️ Si la reserva tenía un pago asociado, **la devolución todavía no está
    implementada** (decisión #5, depende de Mercado Pago). El rechazo se
    registra igual, pero la plata hay que devolverla a mano por ahora.
    """
    try:
        reserva = _get(db, reserva_id)
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=404 if isinstance(e, NotFoundError) else 422, detail=str(e))

    if reserva.estado not in ESTADOS_BANDEJA:
        raise HTTPException(
            status_code=409,
            detail=f"La reserva ya fue resuelta (estado: {reserva.estado})",
        )

    reserva.estado = EstadoReserva.CANCELADA.value
    reserva.web_motivo_rechazo = payload.motivo
    reserva.motivo_cancelacion = payload.motivo
    reserva.web_resuelta_por = current_user.id
    reserva.web_resuelta_en = datetime.utcnow()
    db.commit()
    db.refresh(reserva)

    return ok(
        ReservaResponse.model_validate(reserva),
        "Solicitud rechazada. Si había un pago, la devolución todavía se hace a mano.",
    )
