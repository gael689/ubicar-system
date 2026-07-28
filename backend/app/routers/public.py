"""
Endpoints públicos — los consume `web/` (Next.js), sin autenticación.

⚠️ **Superficie pública.** Todo lo de acá lo puede llamar cualquiera desde
internet. Antes de publicar hace falta rate limiting por IP (ver
`docs/PLAN_RESERVAS_WEB.md` §9): sin eso, un script puede tomar todo el cupo
de la flota en segundos.
"""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.responses import ok
from app.database import get_db
from app.domain.disponibilidad import validar_rango_web
from app.models.adicional import Adicional
from app.services.disponibilidad_service import DisponibilidadService
from app.services.hold_service import MINUTOS_DEFAULT as HOLD_MINUTOS_DEFAULT, HoldService


class HoldCreateRequest(BaseModel):
    categoria_id: int
    fecha_inicio: date
    hora_inicio: time = time(10, 0)
    fecha_fin: date
    hora_fin: time = time(10, 0)

router = APIRouter(prefix="/public", tags=["Público"])

# Decisión #2 de docs/DECISIONES_RESERVAS_WEB.md — todavía sin confirmar por
# los dueños. Es un parámetro y no una constante enterrada justamente por eso.
ANTICIPACION_MINIMA_HORAS = 24
DURACION_MAXIMA_DIAS = 90


@router.get("/disponibilidad")
def get_disponibilidad(
    fecha_inicio: date = Query(..., description="Retiro, ISO YYYY-MM-DD"),
    fecha_fin: date = Query(..., description="Devolución, ISO YYYY-MM-DD"),
    hora_inicio: time = Query(time(10, 0)),
    hora_fin: time = Query(time(10, 0)),
    db: Session = Depends(get_db),
):
    """
    Categorías disponibles en el rango, con cupo y precio.

    Reemplaza al stub anterior, que **filtraba por `estado == 'disponible'` e
    ignoraba las fechas recibidas** — devolvía autos ya comprometidos y omitía
    los que se liberaban dentro del rango.

    Devuelve todas las categorías publicables, con o sin cupo: las agotadas se
    muestran deshabilitadas en la web en vez de ocultarse.
    """
    inicio_dt = datetime.combine(fecha_inicio, hora_inicio)
    fin_dt = datetime.combine(fecha_fin, hora_fin)
    try:
        validar_rango_web(
            inicio_dt, fin_dt, datetime.now(),
            anticipacion_minima_horas=ANTICIPACION_MINIMA_HORAS,
            duracion_maxima_dias=DURACION_MAXIMA_DIAS,
        )
    except ValueError as e:
        # 422 con el texto tal cual: está redactado para mostrárselo al cliente.
        raise HTTPException(status_code=422, detail=str(e))

    categorias = DisponibilidadService(db).consultar(
        fecha_inicio, hora_inicio, fecha_fin, hora_fin,
    )
    return ok({
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "dias": (fecha_fin - fecha_inicio).days,
        "categorias": categorias,
    })


@router.get("/adicionales")
def get_adicionales_publicos(db: Session = Depends(get_db)):
    """
    Coberturas y extras del paso 2 del flujo web.

    Sólo los marcados `visible_web`: el catálogo interno puede tener ítems que
    no se venden online.
    """
    items = (
        db.query(Adicional)
        .filter(Adicional.activo.is_(True), Adicional.visible_web.is_(True))
        .order_by(Adicional.grupo, Adicional.orden, Adicional.nombre)
        .all()
    )
    return ok([
        {
            "id": a.id,
            "codigo": a.codigo,
            "nombre": a.nombre,
            "descripcion": a.descripcion,
            "grupo": a.grupo,
            "precio": a.precio,
            "unidad_cobro": a.unidad_cobro,
            "incluido": a.incluido,
            "franquicia": a.franquicia,
            "max_cantidad": a.max_cantidad,
        }
        for a in items
    ])


@router.get("/config")
def get_config_publica():
    """
    Parámetros que la web necesita para validar del lado del cliente y no
    hacerle perder un viaje al servidor.
    """
    return ok({
        "anticipacion_minima_horas": ANTICIPACION_MINIMA_HORAS,
        "duracion_maxima_dias": DURACION_MAXIMA_DIAS,
        "lugares_retiro": [
            "Paraguay 241",
            "Alsina 350",
            "Aeropuerto Comandante Espora",
            # D-39: sólo Bahía Blanca por ahora. "Juan Francisco Seguí 3607"
            # es Capital Federal y se saca del flujo online — vender dos
            # ciudades sin resolver si la flota es la misma prometería un auto
            # que está a 700 km. Se retoma con D-39b.
        ],
        "hold_minutos": HOLD_MINUTOS_DEFAULT,
    })


# ─── Holds (ítem 61) ─────────────────────────────────────────────────────────

@router.post("/holds", status_code=status.HTTP_201_CREATED)
def crear_hold(payload: HoldCreateRequest, db: Session = Depends(get_db)):
    """
    Toma el cupo mientras el cliente completa el pago.

    Verificar y tomar es **una sola operación** dentro del service: hacerlo en
    dos pasos deja que dos requests simultáneos vean "queda 1" a la vez.
    """
    inicio_dt = datetime.combine(payload.fecha_inicio, payload.hora_inicio)
    fin_dt = datetime.combine(payload.fecha_fin, payload.hora_fin)
    try:
        validar_rango_web(
            inicio_dt, fin_dt, datetime.now(),
            anticipacion_minima_horas=ANTICIPACION_MINIMA_HORAS,
            duracion_maxima_dias=DURACION_MAXIMA_DIAS,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        hold = HoldService(db).crear(
            payload.categoria_id, payload.fecha_inicio, payload.hora_inicio,
            payload.fecha_fin, payload.hora_fin,
        )
        db.commit()
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        # 409 y no 422: el request es válido, lo que falta es el cupo.
        raise HTTPException(status_code=409, detail=str(e))

    return ok(_hold_response(hold), "Cupo reservado")


@router.get("/holds/{token}")
def ver_hold(token: str, db: Session = Depends(get_db)):
    """Estado y segundos restantes — alimenta la cuenta regresiva de la web."""
    try:
        hold = HoldService(db).get_por_token(token)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(_hold_response(hold))


@router.post("/holds/{token}/extender")
def extender_hold(token: str, db: Session = Depends(get_db)):
    """
    Renueva la ventana. Se ofrece cuando faltan pocos minutos: es preferible
    darle más tiempo a alguien que está pagando que perder la venta.
    """
    svc = HoldService(db)
    try:
        hold = svc.extender(token)
        db.commit()
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return ok(_hold_response(hold), "Tiempo extendido")


@router.delete("/holds/{token}")
def liberar_hold(token: str, db: Session = Depends(get_db)):
    """El cliente volvió atrás o cerró: el cupo se libera al instante."""
    svc = HoldService(db)
    try:
        hold = svc.liberar(token)
        db.commit()
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(_hold_response(hold), "Cupo liberado")


def _hold_response(hold) -> dict:
    return {
        "token": hold.token,
        "categoria_id": hold.categoria_id,
        "fecha_inicio": hold.fecha_inicio,
        "hora_inicio": hold.hora_inicio,
        "fecha_fin": hold.fecha_fin,
        "hora_fin": hold.hora_fin,
        "expira_en": hold.expira_en,
        "segundos_restantes": hold.segundos_restantes,
        "vigente": hold.vigente,
        "estado": hold.estado,
    }


@router.post("/reservas")
async def crear_reserva_publica(db: Session = Depends(get_db)):
    """
    Alta de reserva desde la web (ítems 61-62).

    **Todavía no implementado, a propósito.** Depende de:
    - los holds con expiración (ítem 61),
    - Mercado Pago (ítem 62),
    - y las decisiones #1, #4 y #5 de `docs/DECISIONES_RESERVAS_WEB.md`
      (cuánto se cobra por adelantado, qué pasa si el pago se aprueba sin
      cupo, y cómo se devuelve la plata).

    Devuelve **501 y no un 200 "Próximamente"** como antes: un stub que
    responde OK le hace creer al front que la reserva se creó.
    """
    raise HTTPException(
        status_code=501,
        detail="Las reservas online todavía no están habilitadas. "
               "Escribinos por WhatsApp y te la cargamos.",
    )
