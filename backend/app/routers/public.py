"""
Endpoints públicos — los consume `web/` (Next.js), sin autenticación.

⚠️ **Superficie pública.** Todo lo de acá lo puede llamar cualquiera desde
internet. Antes de publicar hace falta rate limiting por IP (ver
`docs/PLAN_RESERVAS_WEB.md` §9): sin eso, un script puede tomar todo el cupo
de la flota en segundos.
"""
import logging
from datetime import date, datetime, time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
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
# 72 horas, no 24. Una reserva web dispara trabajo de mostrador antes de que el
# cliente aparezca —asignar el vehículo, emitir el contrato y esperar la firma
# (D-47)—, y con un día de plazo eso no entra. Se avisa en el Hero, no sólo al
# validar: enterarse del plazo recién cuando el formulario te rechaza la fecha
# es la peor forma de comunicarlo.
ANTICIPACION_MINIMA_HORAS = 72
DURACION_MAXIMA_DIAS = 90


@router.get("/disponibilidad", dependencies=[Depends(limite_consultas)])
def get_disponibilidad(
    fecha_inicio: date = Query(..., description="Retiro, ISO YYYY-MM-DD"),
    fecha_fin: date = Query(..., description="Devolución, ISO YYYY-MM-DD"),
    hora_inicio: time = Query(time(10, 0)),
    hora_fin: time = Query(time(10, 0)),
    # Los topes son una validación de entrada, no una regla de negocio: D-38
    # dice que la edad modifica el precio y no rechaza a nadie. Sirven para que
    # un `edad=-5` no llegue al motor de precios.
    edad: int | None = Query(
        None, ge=16, le=110,
        description="Edad declarada del responsable. Hace que el precio salga con el recargo por edad ya incluido",
    ),
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
        edad_conductor=edad,
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


class AdicionalElegido(BaseModel):
    adicional_id: int
    cantidad: int = 1


class CotizarPublicoRequest(BaseModel):
    """
    Lo mismo que `CalcularPrecioRequest` **menos el canal y el vehículo**.

    El canal no se acepta como dato: lo fija el servidor en `web`. Si viniera
    del navegador, cualquiera podría pedir la lista de precios del mostrador
    —que es la que se negocia— desde la consola.

    El vehículo tampoco: la web vende por categoría, y dejar cotizar una unidad
    puntual expondría la patente y el precio de cada auto de la flota.
    """
    fecha_inicio: date
    fecha_fin: date
    categoria_id: int
    adicionales: list[AdicionalElegido] = []
    fecha_nacimiento: date | None = None
    # La declarada en el buscador de la portada. Sostiene el precio en los
    # pasos 2 y 3, mientras todavía no se cargó la fecha de nacimiento: sin
    # esto el total **bajaría** al avanzar desde el paso 1, que ya cotizó con
    # el recargo. Cuando llega la fecha exacta, esa manda (ver PrecioService).
    edad: int | None = Field(None, ge=16, le=110)
    # Cuánto piensa adelantar. **Cambia el precio**: en la web el descuento por
    # duración sólo corre pagando el 100% (ver `aplica_descuento_por_duracion`).
    # Sin este dato se cotiza sin descuento, que es lo correcto en los pasos 1 a
    # 3, donde el cliente todavía no eligió.
    porcentaje_anticipo: int | None = Field(None, ge=1, le=100)


@router.post("/cotizar", dependencies=[Depends(limite_consultas)])
def cotizar_publico(payload: CotizarPublicoRequest, db: Session = Depends(get_db)):
    """
    El precio que ve el cliente en los pasos 2, 3 y 4 del flujo web.

    **Existe porque `/precios/calcular` pide login**, y la web no tiene ni
    tiene que tener un usuario: sin esto, el flujo mostraba el precio en el
    paso 1 (que sale de `/public/disponibilidad`) y desde el paso 2 en
    adelante daba 401 — el cliente elegía un seguro y el total no aparecía.

    Es el mismo `PrecioService` que usa el mostrador, no una segunda cuenta:
    duplicar la fórmula es cómo se llega a que la web cobre distinto que el
    sistema por el mismo alquiler.

    **El total de acá es informativo.** Lo que se cobra se recalcula en
    `POST /public/reservas`, del lado del servidor — ver §6 del plan: nunca se
    confía en el monto que manda el navegador.
    """
    from app.core.exceptions import BusinessRuleError as _BRE
    from app.services.precio_service import PrecioService

    if payload.fecha_fin <= payload.fecha_inicio:
        raise HTTPException(422, "La fecha de fin debe ser posterior a la de inicio")

    try:
        cotizacion, categoria_id = PrecioService(db).calcular(
            fecha_inicio=payload.fecha_inicio,
            fecha_fin=payload.fecha_fin,
            categoria_id=payload.categoria_id,
            vehiculo_id=None,
            canal="web",
            adicionales=[(a.adicional_id, a.cantidad) for a in payload.adicionales],
            fecha_nacimiento=payload.fecha_nacimiento,
            edad_conductor=payload.edad,
            porcentaje_anticipo=payload.porcentaje_anticipo,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except _BRE as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok({
        "dias": [d.__dict__ for d in cotizacion.dias],
        "duracion_dias": cotizacion.duracion_dias,
        "subtotal": cotizacion.subtotal,
        "descuento_porcentaje": cotizacion.descuento_porcentaje,
        "descuento_monto": cotizacion.descuento_monto,
        "descuento_nombre": cotizacion.descuento_nombre,
        "subtotal_vehiculo": cotizacion.subtotal_vehiculo,
        "adicionales": [a.__dict__ for a in cotizacion.adicionales],
        "total_adicionales": cotizacion.total_adicionales,
        "recargo_edad": (
            cotizacion.recargo_edad.__dict__ if cotizacion.recargo_edad else None
        ),
        "total": cotizacion.total,
        "precio_dia_promedio": cotizacion.precio_dia_promedio,
        "total_referencia": cotizacion.total_referencia,
        "tiene_promocion": cotizacion.tiene_promocion,
        "promociones": cotizacion.promociones,
        "categoria_id": categoria_id,
        "vehiculo_id": None,
    })


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
    from app.models.tarifa_calendario import DescuentoDuracion
    from app.services.configuracion_service import ConfiguracionService

    # La escalera por duración es información de venta: "llevátelo una semana y
    # ahorrás 15%". Sin exponerla, el cliente sólo descubre el descuento después
    # de cambiar las fechas y ver que el total bajó — que es justo al revés de
    # lo que hace que alquile más días.
    #
    # Sólo salen las generales: una banda atada a una categoría es una decisión
    # comercial puntual y publicarla en el config del sitio la vuelve un precio
    # de lista que después hay que sostener.
    escalones = (
        db.query(DescuentoDuracion)
        .filter(
            DescuentoDuracion.activo.is_(True),
            DescuentoDuracion.categoria_id.is_(None),
        )
        .order_by(DescuentoDuracion.dias_desde)
        .all()
    )

    return ok({
        "escalones_duracion": [
            {
                "nombre": d.nombre,
                "dias_desde": d.dias_desde,
                "dias_hasta": d.dias_hasta,
                "porcentaje": float(d.porcentaje),
            }
            for d in escalones
        ],
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


# Los mismos cuatro valores del enum `condicion_iva` de la base (migración
# 023). Se declara acá y no se importa el enum de SQLAlchemy para que un
# valor inventado desde el navegador falle con un 422 legible en vez de
# reventar en el INSERT.
CondicionIvaWeb = Literal[
    "responsable_inscripto", "monotributo", "consumidor_final", "exento",
]


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
    # Datos fiscales. El sistema **todavía no emite comprobantes fiscales**:
    # esto no habilita a facturar, guarda el dato para que quien factura no
    # tenga que perseguir al cliente por el CUIT después, y para el día que se
    # conecte la facturación electrónica. Los campos ya existían en `Cliente`
    # (migración 023), sólo que la web nunca los cargaba.
    condicion_iva: CondicionIvaWeb | None = None
    razon_social: str | None = None


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
            condicion_iva=payload.condicion_iva,
            razon_social=payload.razon_social,
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
    """
    La URL que Mercado Pago va a llamar.

    **Lleva el prefijo `/api/v1`**: este router se monta con `prefix="/public"`
    dentro de `API_PREFIX`, así que la ruta real es
    `/api/v1/public/webhooks/mercadopago`. Sin el prefijo, MP recibe 404 en
    cada notificación y —como el webhook es la fuente de verdad del cobro—
    **ninguna reserva se confirma nunca**: el cliente paga, el hold vence y el
    auto se libera. Falla en silencio, porque el webhook siempre responde 200.
    """
    base = (settings.backend_public_url or "").rstrip("/")
    return f"{base}/api/v1/public/webhooks/mercadopago" if base else ""


# ─── Firma del contrato por link (D-C6) ──────────────────────────────────────
#
# El cliente recibe `{web}/contrato/{token}` y firma desde su teléfono. Estos
# tres endpoints son toda la superficie pública: leer, firmar y descargar.
#
# **El token es la credencial.** No hay login del otro lado y no puede haberlo:
# quien firma es alguien que alquiló un auto una vez, no un usuario del
# sistema. Por eso el token es largo, vence, y se revoca desde el mostrador.


class FirmarPorLinkRequest(BaseModel):
    nombre: str
    dni: str
    # PNG en data-URL, el mismo formato que manda el mostrador.
    firma_base64: str
    # Las claves de `contrato_clausulado.ACEPTACIONES` que el cliente tildó.
    # Se mandan todas o el service rechaza: no es un formulario a completar a
    # medias.
    aceptaciones: list[str] = []


def _contrato_para_el_cliente(contrato, plantilla) -> dict:
    """
    Lo que ve el cliente. **Es el snapshot congelado**, igual que el PDF: si
    esta pantalla leyera las tablas vivas, mostraría un contrato distinto del
    que se emitió, y la firma valdría sobre otro texto.
    """
    from app.domain import contrato_clausulado

    return {
        "numero": contrato.numero_formateado,
        "snapshot": contrato.snapshot or {},
        "clausulado": {
            "version": plantilla.version,
            "titulo": plantilla.titulo,
            "clausulas": plantilla.clausulas,
        },
        "aceptaciones": contrato_clausulado.ACEPTACIONES,
        "firmado": contrato.firmado,
        "firmado_at": contrato.firmado_at,
        "firmado_por_nombre": contrato.firmado_por_nombre,
        "expira": contrato.firma_token_expira,
        # La pantalla decide con esto si muestra el formulario o el "ya está
        # firmado, acá lo tenés". El backend no puede delegar la validez del
        # link al navegador, pero sí puede evitarle un intento perdido.
        "vencido": bool(
            contrato.firma_token_expira
            and contrato.firma_token_expira <= datetime.utcnow()
        ),
    }


@router.get("/contratos/{token}", dependencies=[Depends(limite_consultas)])
def ver_contrato_por_token(token: str, db: Session = Depends(get_db)):
    """
    El contrato completo, para leerlo antes de firmar.

    **Sigue respondiendo después de firmado y después de vencido**, a
    propósito: es lo que permite que el cliente vuelva a abrir el link que
    tiene en el WhatsApp y se baje su copia. Un link que muere al firmar deja
    a la persona sin el documento que acaba de aceptar.
    """
    from app.models.contrato import ContratoPlantilla
    from app.services.contrato_service import ContratoService

    svc = ContratoService(db)
    try:
        contrato = svc.por_token(token, para_firmar=False)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Este link no es válido.")
    except BusinessRuleError as e:
        raise HTTPException(status_code=410, detail=_mensaje(e))

    plantilla = (
        db.get(ContratoPlantilla, contrato.plantilla_id)
        if contrato.plantilla_id else svc.plantilla_vigente()
    )
    return ok(_contrato_para_el_cliente(contrato, plantilla))


@router.post("/contratos/{token}/firmar", dependencies=[Depends(limite_solicitudes)])
def firmar_contrato_por_token(
    token: str,
    payload: FirmarPorLinkRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    El cliente firma. Es el único endpoint público que escribe en `contratos`.

    Va con el limitador de solicitudes y no con el de consultas: firmar es una
    acción, y sin tope alguien con el token podría martillarlo.
    """
    import base64

    from app.services.contrato_service import ContratoService

    try:
        crudo = payload.firma_base64.split(",", 1)[-1]
        firma_bytes = base64.b64decode(crudo) if crudo else None
    except Exception:
        raise HTTPException(status_code=422, detail="La firma no se pudo leer. Volvé a trazarla.")

    svc = ContratoService(db)
    try:
        contrato = svc.firmar_por_link(
            token,
            nombre=payload.nombre.strip(),
            dni=payload.dni.strip(),
            firma_bytes=firma_bytes,
            aceptadas=payload.aceptaciones,
            ip=_ip_del_cliente(request),
            user_agent=request.headers.get("user-agent"),
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Este link no es válido.")
    except BusinessRuleError as e:
        # 422 cuando falta algo del formulario y el cliente puede corregirlo;
        # 409 cuando el contrato ya no admite la firma (vencido, anulado o ya
        # firmado) y no hay nada que corregir.
        codigo = 422 if e.rule in ("faltan_aceptaciones", "falta_firma") else 409
        raise HTTPException(status_code=codigo, detail=_mensaje(e))

    _avisar_contrato_firmado(db, contrato)
    db.commit()

    return ok(
        {"numero": contrato.numero_formateado, "firmado_at": contrato.firmado_at},
        "Contrato firmado. Te mandamos una copia por mail.",
    )


@router.get("/contratos/{token}/pdf", dependencies=[Depends(limite_consultas)])
def descargar_contrato_por_token(token: str, db: Session = Depends(get_db)):
    """
    El PDF, para que el cliente se lo lleve.

    Se sirve `inline` y no como adjunto: en el teléfono, un `attachment` cae en
    una carpeta de Descargas que mucha gente no encuentra, mientras que
    `inline` lo abre en el visor y desde ahí se comparte o se guarda.
    """
    from app.services.contrato_service import ContratoService

    svc = ContratoService(db)
    try:
        contrato = svc.por_token(token, para_firmar=False)
        pdf = svc.generar_pdf(contrato.id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Este link no es válido.")
    except BusinessRuleError as e:
        raise HTTPException(status_code=410, detail=_mensaje(e))

    nombre = f"contrato_{contrato.numero_formateado}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nombre}"'},
    )


def _mensaje(e: BusinessRuleError) -> str:
    """
    El texto sin el `[codigo]` que antepone `BusinessRuleError`.

    Adentro del sistema ese prefijo ayuda a rastrear el error; en una pantalla
    pública es ruido que el cliente lee como si algo se hubiera roto. Los
    mensajes de estas reglas están redactados para mostrárselos tal cual.
    """
    texto = str(e)
    return texto.split("] ", 1)[1] if texto.startswith("[") and "] " in texto else texto


def _ip_del_cliente(request: Request) -> str | None:
    """
    La IP real detrás del proxy de Railway. `request.client.host` sería la del
    balanceador y registraría la misma para todos los clientes, que es lo mismo
    que no registrar nada.
    """
    reenviada = request.headers.get("x-forwarded-for")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.client.host if request.client else None


def _avisar_contrato_firmado(db: Session, contrato) -> None:
    """
    Avisa que el contrato se firmó: campana adentro, mail con el PDF adjunto
    para el equipo y para el cliente.

    **Nada de esto puede voltear la firma.** El cliente ya firmó; que falle un
    mail no puede devolver un error que lo deje pensando que no quedó.
    """
    from app.services.contrato_firmado_email import notificar_contrato_firmado
    from app.services.notificacion_service import NotificacionService

    reserva = contrato.reserva
    try:
        NotificacionService(db).generar_una({
            "tipo": "contrato_firmado",
            "titulo": "Contrato firmado por el cliente",
            "descripcion": (
                f"{contrato.numero_formateado} — {contrato.firmado_por_nombre} "
                f"firmó desde el link"
                + (f" (reserva #{reserva.id})" if reserva else "")
            ),
            "urgencia": "media",
            "entidad_tipo": "contrato",
            "entidad_id": contrato.id,
            "url_destino": f"/reservas?reserva={reserva.id}" if reserva else "/contratos",
            "fecha_objetivo": reserva.fecha_inicio if reserva else None,
        })
    except Exception:
        logger.exception("[Contratos] falló la notificación de firma de %s", contrato.id)

    notificar_contrato_firmado(db, contrato)


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
