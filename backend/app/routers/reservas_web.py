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

**Acá no se asigna el vehículo.** Hubo un `POST /{id}/aceptar` que lo hacía
con un `reserva.vehiculo_id = ...` pelado: sin lock sobre el auto, sin la
lógica de upgrade/downgrade de D-54, sin auditoría y sin tocar el contrato.
Era una tercera implementación en paralelo de algo que `ReservaService` ya
sabía hacer bien, y las tres habían derivado.

Se borró el 19/08. El frontend ya no lo llamaba —`useAceptarReservaWeb` estaba
definido y sin usar— pero el endpoint seguía expuesto y era el único camino
por el que se podía asignar un auto sin dejar rastro.

**Asignar va por `POST /reservas/{id}/asignar-vehiculo`**, que es el único
lugar donde vive esa lógica.
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


def _pendientes_query(db: Session):
    """
    **Qué cuenta como "esto requiere que alguien haga algo".** Una sola
    definición, usada por el contador y por la lista.

    Estaban separadas: el contador la tenía escrita adentro de `/resumen` y la
    lista no existía. En cuanto una lista mostrara algo distinto de lo que el
    número dice, el aviso permanente de la pantalla —que no se puede
    descartar— pasaría a mentir, y un aviso que miente se aprende a ignorar en
    dos días.

    Son tres cosas distintas, y ninguna es `pendiente_pago`: ésa espera al
    cliente, no a nosotros.

    - `sin_disponibilidad` — pidió una categoría agotada y dejó sus datos
    - `revision_sin_cupo` — **pagó y no hay auto**. Plata del cliente en juego
    - `confirmada` sin vehículo o sin contrato vigente — la que más se escapa:
      está confirmada, así que parece resuelta, pero sin auto asignado **no
      tiene fila donde dibujarse en el calendario** y es invisible
    """
    from sqlalchemy import exists, or_

    from app.models.contrato import Contrato

    tiene_contrato_vigente = exists().where(
        Contrato.reserva_id == Reserva.id,
        Contrato.anulado.is_(False),
        Contrato.activo.is_(True),
    )
    return db.query(Reserva).filter(
        Reserva.origen == "web",
        or_(
            Reserva.estado.in_((
                EstadoReserva.SIN_DISPONIBILIDAD.value,
                EstadoReserva.REVISION_SIN_CUPO.value,
            )),
            (Reserva.estado == EstadoReserva.CONFIRMADA.value)
            & (Reserva.vehiculo_id.is_(None) | ~tiene_contrato_vigente),
        ),
    )


@router.get("/pendientes")
def listar_pendientes(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Lo que alimenta el aviso permanente de la pantalla.

    **No tiene ventana de fechas ni paginado, a propósito.** El panel de
    Ocupación mostraba sólo lo que caía en el rango del calendario que estabas
    mirando: una reserva para marzo no aparecía en ningún lado si estabas
    viendo agosto. Acá se devuelve todo lo pendiente, sin importar cuándo sea
    el alquiler — son unidades, no miles, porque cada fila es trabajo que
    alguien tiene que hacer hoy.

    Ordenado por urgencia y después por antigüedad: primero lo que tiene plata
    del cliente en juego, y dentro de eso lo que lleva más tiempo esperando.
    """
    items = _pendientes_query(db).all()

    def orden(r: Reserva) -> tuple[int, object]:
        # `revision_sin_cupo` primero: pagó y no hay auto.
        prioridad = 0 if r.estado == EstadoReserva.REVISION_SIN_CUPO.value else 1
        return (prioridad, r.created_at)

    items.sort(key=orden)
    return ok([ReservaResponse.model_validate(r) for r in items])


@router.get("/resumen")
def resumen_bandeja(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Contadores para el badge del menú.

    **Plan de conexión (13/08), cierra C-8.** Antes `pendientes` sólo sumaba
    `sin_disponibilidad` + `revision_sin_cupo` — las que están en ESTA
    bandeja. Pero una reserva web ya `confirmada` sin auto o sin contrato
    también es trabajo pendiente; la propia pantalla la llama "Cobradas, pero
    sin terminar" (`ReservasWebPage.tsx`) y hasta ahora **no la contaba nadie**:
    el único número visible del sistema (la campana) era justo el que se
    autoborraba (C-2), así que no había ningún contador confiable de "cuánto
    falta".
    """
    conteo = {
        e: db.query(Reserva)
        .filter(Reserva.origen == "web", Reserva.estado == e)
        .count()
        for e in ESTADOS_BANDEJA
    }

    # **El mismo query que la lista.** Ver `_pendientes_query`: si el número y
    # la lista se calcularan por separado, el aviso permanente diría "3" y
    # mostraría dos.
    pendientes = _pendientes_query(db).count()
    confirmadas_sin_terminar = (
        pendientes
        - conteo[EstadoReserva.SIN_DISPONIBILIDAD.value]
        - conteo[EstadoReserva.REVISION_SIN_CUPO.value]
    )

    return ok({
        "por_estado": conteo,
        "confirmadas_sin_terminar": confirmadas_sin_terminar,
        # Lo que realmente requiere que alguien haga algo. `pendiente_pago`
        # no cuenta: está esperando al cliente, no a nosotros.
        "pendientes": pendientes,
    })


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

    **Si el cliente ya había pagado, se le reintegra.** Antes esto sólo cambiaba
    el estado y avisaba "la devolución se hace a mano" — la plata quedaba en la
    caja, el libro seguía diciendo que había entrado, y devolverla dependía de
    que alguien se acordara.

    Ahora pasa por `ReservaService.cancelar(responsable="ubicar")`, que es
    exactamente el caso: **el que no pudo cumplir fue Ubicar**, no el cliente.
    Una reserva llega a esta bandeja porque el cupo se fue o porque pidieron
    algo que no había, así que D-11 manda reintegrar el 100 %. El reembolso sale
    de la caja con su medio y el débito consume el crédito del anticipo.

    Las que no tienen nada pagado —`pendiente_pago` sin transferencia
    acreditada— no generan ningún movimiento: no hay qué devolver.
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

    # El asiento lo hace el service, no este router: es el único lugar donde
    # vive la regla de qué pasa con la plata al cancelar (D-11), y duplicarla
    # acá era lo que hacía que este camino la salteara.
    from app.services.reserva_service import ReservaService

    tenia_pago = bool(reserva.anticipo_monto and reserva.anticipo_monto > 0)
    try:
        ReservaService(db).cancelar(
            reserva.id,
            current_user.id,
            payload.motivo,
            # No pudimos cumplir nosotros: se reintegra el 100 %.
            responsable="ubicar",
            reembolso_medio=reserva.anticipo_medio_pago or "transferencia",
        )
    except (BusinessRuleError, ConflictError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Lo propio de la bandeja web: quién la resolvió y con qué motivo, que es
    # lo que después permite medir por qué se caen las ventas.
    reserva.web_motivo_rechazo = payload.motivo
    reserva.web_resuelta_por = current_user.id
    reserva.web_resuelta_en = datetime.utcnow()

    from app.services.notificacion_service import NotificacionService
    NotificacionService(db).resolver_por_entidad("reserva", reserva.id, current_user.id)

    db.commit()
    db.refresh(reserva)

    return ok(
        ReservaResponse.model_validate(reserva),
        "Reserva rechazada y reintegrada al cliente." if tenia_pago
        else "Reserva rechazada.",
    )
