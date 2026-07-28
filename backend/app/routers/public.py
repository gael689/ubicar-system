"""
Endpoints públicos — los consume `web/` (Next.js), sin autenticación.

⚠️ **Superficie pública.** Todo lo de acá lo puede llamar cualquiera desde
internet. Antes de publicar hace falta rate limiting por IP (ver
`docs/PLAN_RESERVAS_WEB.md` §9): sin eso, un script puede tomar todo el cupo
de la flota en segundos.
"""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.responses import ok
from app.database import get_db
from app.domain.disponibilidad import validar_rango_web
from app.models.adicional import Adicional
from app.services.disponibilidad_service import DisponibilidadService

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
            "Juan Francisco Seguí 3607",
        ],
    })


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
