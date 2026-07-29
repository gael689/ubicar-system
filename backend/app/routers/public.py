"""
Endpoints públicos — los consume `web/` (Next.js), sin autenticación.

⚠️ **Superficie pública.** Todo lo de acá lo puede llamar cualquiera desde
internet. Antes de publicar hace falta rate limiting por IP (ver
`docs/PLAN_RESERVAS_WEB.md` §9): sin eso, un script puede tomar todo el cupo
de la flota en segundos.
"""
import logging
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
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

logger = logging.getLogger(__name__)

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
def get_config_publica(db: Session = Depends(get_db)):
    """
    Parámetros que la web necesita para validar del lado del cliente y no
    hacerle perder un viaje al servidor.
    """
    from app.adapters.pagos import cobro_habilitado
    from app.domain.pagos_web import (
        CLAVE_DESCUENTO_PAGO_TOTAL, DESCUENTO_PAGO_TOTAL_DEFAULT, PORCENTAJES_ANTICIPO,
    )
    from app.services.configuracion_service import ConfiguracionService

    return ok({
        # Con esto la web decide si muestra el botón de pagar o el cartel de
        # "coordinamos por WhatsApp", en vez de ofrecer un pago que va a fallar.
        "cobro_online": cobro_habilitado(),
        "porcentajes_anticipo": list(PORCENTAJES_ANTICIPO),
        "descuento_pago_total_pct": float(
            ConfiguracionService(db).get_decimal(
                CLAVE_DESCUENTO_PAGO_TOTAL, DESCUENTO_PAGO_TOTAL_DEFAULT
            )
        ),
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


class AdicionalElegido(BaseModel):
    adicional_id: int
    cantidad: int = 1


class ReservaWebRequest(BaseModel):
    """
    Paso 4 del flujo web. **No lleva precio**: el total se recalcula en el
    servidor. Es un endpoint público, y el monto a cobrar es justamente lo que
    alguien querría manipular.
    """
    hold_token: str
    nombre: str
    email: str
    telefono: str
    dni: str
    lugar_entrega: str
    lugar_devolucion: str | None = None
    # D-30: el cliente elige cuánto adelanta, con piso del 30%.
    porcentaje_anticipo: int = 30
    adicionales: list[AdicionalElegido] = []
    fecha_nacimiento: date | None = None
    notas: str | None = None


@router.post("/reservas", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limite_solicitudes)])
def crear_reserva_publica(payload: ReservaWebRequest, db: Session = Depends(get_db)):
    """
    Alta de reserva **con pago** desde la web (ítem 62).

    Crea la reserva en `pendiente_pago` y devuelve la URL de Checkout Pro. La
    reserva **no queda confirmada acá**: se confirma en el webhook, que es la
    fuente de verdad. El cliente puede cerrar la pestaña sin volver al sitio y
    el pago igual entra.

    El cupo lo sostiene el hold mientras tanto, no la reserva: `pendiente_pago`
    no ocupa calendario a propósito, para que un checkout abandonado no bloquee
    un auto hasta que alguien lo note.
    """
    from app.adapters.pagos import cobro_habilitado
    from app.adapters.pagos.interface import PasarelaNoConfigurada
    from app.services.pago_web_service import PagoWebService

    if not cobro_habilitado():
        # 503 y no 501: no es que no exista la función, es que está apagada
        # por falta de credenciales. El mensaje es el que ve el cliente.
        raise HTTPException(
            status_code=503,
            detail="El pago online no está disponible en este momento. "
                   "Escribinos por WhatsApp y cerramos la reserva.",
        )

    try:
        resultado = PagoWebService(db).iniciar_checkout(
            hold_token=payload.hold_token,
            nombre=payload.nombre,
            email=payload.email,
            telefono=payload.telefono,
            dni=payload.dni,
            lugar_entrega=payload.lugar_entrega,
            lugar_devolucion=payload.lugar_devolucion,
            porcentaje_anticipo=payload.porcentaje_anticipo,
            adicionales=[(a.adicional_id, a.cantidad) for a in payload.adicionales],
            fecha_nacimiento=payload.fecha_nacimiento,
            notas=payload.notas,
            url_base_web=settings.web_url,
            url_webhook=_url_webhook(),
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except NotFoundError as e:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        db.rollback()
        # 409: el request es válido, lo que falta es el cupo o venció el hold.
        raise HTTPException(status_code=409, detail=str(e))
    except PasarelaNoConfigurada as e:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(e))

    return ok(resultado, "Te llevamos a Mercado Pago para completar el pago")


def _url_webhook() -> str:
    base = (settings.backend_public_url or "").rstrip("/")
    return f"{base}/public/webhooks/mercadopago" if base else ""


@router.post("/webhooks/mercadopago")
async def webhook_mercadopago(request: Request, db: Session = Depends(get_db)):
    """
    Notificación de Mercado Pago. **Es la fuente de verdad del cobro.**

    **Siempre responde 200**, incluso ante un error nuestro. Un webhook que
    devuelve 500 hace que Mercado Pago reintente en bucle durante horas; lo que
    no se pudo resolver queda marcado como `revision` y salta una alerta, que
    es una forma mucho mejor de enterarse.

    No hace falta autenticar el request: el cuerpo sólo trae un id, y el pago
    se vuelve a leer contra la API con nuestras credenciales. Alguien que
    invente un `payment_id` no consigue nada.
    """
    from app.services.pago_web_service import PagoWebService

    try:
        cuerpo = await request.json()
    except Exception:
        cuerpo = {}

    payment_id = _extraer_payment_id(cuerpo, dict(request.query_params))
    if not payment_id:
        # Mercado Pago manda también notificaciones de otros temas (merchant
        # orders, por ejemplo). No son un error: simplemente no nos interesan.
        return ok({"resultado": "ignorado"}, "Notificación sin pago asociado")

    try:
        resultado = PagoWebService(db).procesar_webhook(payment_id)
    except Exception:
        db.rollback()
        logger.exception("[MercadoPago] falló el webhook para payment_id=%s", payment_id)
        return ok({"resultado": "error_registrado"}, "Recibido")

    return ok(resultado, "Recibido")


def _extraer_payment_id(cuerpo: dict, query: dict) -> str | None:
    """
    Mercado Pago manda el id en tres formatos distintos según el tipo de
    notificación y la antigüedad de la integración. Se aceptan los tres.
    """
    if cuerpo.get("type") == "payment":
        dato = cuerpo.get("data") or {}
        if dato.get("id"):
            return str(dato["id"])
    if cuerpo.get("topic") == "payment" and cuerpo.get("resource"):
        return str(cuerpo["resource"]).rsplit("/", 1)[-1]
    if query.get("type") == "payment" and query.get("data.id"):
        return str(query["data.id"])
    return None
