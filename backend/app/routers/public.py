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
from app.core.rate_limit import limite_consultas, limite_holds, limite_solicitudes
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


@router.get("/disponibilidad", dependencies=[Depends(limite_consultas)])
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

@router.post("/holds", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limite_holds)])
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


class SolicitudSinCupoRequest(BaseModel):
    """
    Solicitud para una categoría agotada (D-04). **No lleva pago**, así que no
    depende de Mercado Pago.
    """
    categoria_id: int
    fecha_inicio: date
    hora_inicio: time = time(10, 0)
    fecha_fin: date
    hora_fin: time = time(10, 0)
    lugar_entrega: str
    lugar_devolucion: str | None = None
    nombre: str
    email: str
    telefono: str
    notas: str | None = None


@router.post("/solicitudes", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limite_solicitudes)])
def crear_solicitud_sin_cupo(payload: SolicitudSinCupoRequest, db: Session = Depends(get_db)):
    """
    Deja la solicitud de alguien que quiso una categoría sin disponibilidad.

    **Es la mitad de D-04 que no necesita cobrar nada**, así que se puede usar
    desde ya: la reserva entra como `sin_disponibilidad`, sin ocupar calendario
    y sin pedir plata, y el equipo la ve en la bandeja para ofrecerle otra
    categoría u otras fechas.

    Lo que resuelve: hoy alguien que busca fechas sin cupo se va del sitio y
    **ese contacto se pierde**. Acá queda registrado, con un aviso inmediato.

    Los datos de contacto se guardan en la propia reserva y no sólo en un
    cliente, porque esta solicitud puede no llegar nunca a convertirse en un
    cliente — y ese contacto es justamente lo que no se quiere perder.
    """
    from app.domain.enums import EstadoReserva
    from app.models.categoria import Categoria
    from app.models.reserva import Reserva
    from app.services.notificacion_service import NotificacionService

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

    categoria = db.get(Categoria, payload.categoria_id)
    if categoria is None or not categoria.activo:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    # `cliente_id` y `usuario_id` son obligatorios en el modelo, pero esta
    # solicitud no tiene ninguno de los dos: no hay cliente todavía y no la
    # cargó un operador. Se usan los registros de sistema, y el contacto real
    # vive en los campos `web_contacto_*`.
    from app.models.cliente import Cliente
    from app.models.usuario import Usuario

    usuario_sistema = db.query(Usuario).order_by(Usuario.id).first()
    cliente_generico = db.query(Cliente).order_by(Cliente.id).first()
    if usuario_sistema is None or cliente_generico is None:
        raise HTTPException(
            status_code=503,
            detail="El sistema todavía no está configurado para recibir solicitudes.",
        )

    reserva = Reserva(
        categoria_id=payload.categoria_id,
        vehiculo_id=None,
        cliente_id=cliente_generico.id,
        fecha_inicio=payload.fecha_inicio,
        hora_inicio=payload.hora_inicio,
        fecha_fin=payload.fecha_fin,
        hora_fin=payload.hora_fin,
        lugar_entrega=payload.lugar_entrega,
        lugar_devolucion=payload.lugar_devolucion or payload.lugar_entrega,
        notas=payload.notas,
        estado=EstadoReserva.SIN_DISPONIBILIDAD.value,
        origen="web",
        usuario_id=usuario_sistema.id,
        web_contacto_nombre=payload.nombre,
        web_contacto_email=payload.email,
        web_contacto_telefono=payload.telefono,
    )
    db.add(reserva)
    db.flush()

    # Aviso en el acto: esperar al barrido de las 08:00 significa que una
    # solicitud del sábado a la tarde queda sin respuesta hasta el lunes.
    NotificacionService(db).avisar_reserva_web(reserva)
    db.commit()

    return ok(
        {"reserva_id": reserva.id, "categoria": categoria.nombre},
        "Recibimos tu solicitud. Te contactamos para ofrecerte una alternativa.",
    )


@router.post("/reservas")
async def crear_reserva_publica(db: Session = Depends(get_db)):
    """
    Alta de reserva **con pago** desde la web (ítem 62).

    **Todavía no implementado**: depende de Mercado Pago y de las decisiones
    #4 y #5 de `docs/DECISIONES_RESERVAS_WEB.md` (qué pasa si el pago se
    aprueba sin cupo, y cómo se devuelve la plata).

    Cuando se implemente **tiene que llamar a
    `NotificacionService.avisar_reserva_web(reserva)`** después de crearla: el
    equipo necesita enterarse en el momento, no en el barrido de las 08:00.

    Para la solicitud **sin** pago —una categoría agotada— ya existe
    `POST /public/solicitudes`, que sí funciona.

    Devuelve **501 y no un 200 "Próximamente"**: un stub que responde OK le
    hace creer al front que la reserva se creó.
    """
    raise HTTPException(
        status_code=501,
        detail="El pago online todavía no está habilitado. "
               "Escribinos por WhatsApp y cerramos la reserva.",
    )
