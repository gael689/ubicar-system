"""
Endpoints públicos — los consume `web/` (Next.js), sin autenticación.

⚠️ **Superficie pública.** Todo lo de acá lo puede llamar cualquiera desde
internet. Antes de publicar hace falta rate limiting por IP (ver
`docs/PLAN_RESERVAS_WEB.md` §9): sin eso, un script puede tomar todo el cupo
de la flota en segundos.
"""
import logging
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from fastapi import (
    APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status,
)
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

# D-52 (plan de conexión, 13/08) — reemplaza a D-50 (72hs). Son los defaults
# si `configuracion` no tiene la clave cargada (no debería pasar tras la
# migración 063, pero un fallback razonable es más seguro que un 500).
# **Los valores reales viven en `configuracion`** — ver `_ventana_web()` — no
# acá: son palancas comerciales que Franco va a mover por temporada, y eso no
# puede requerir un deploy.
_ANTICIPACION_MINIMA_HORAS_DEFAULT = 240   # 10 días
_HORIZONTE_MAXIMO_DIAS_DEFAULT = 120       # 4 meses
_DURACION_MAXIMA_DIAS_DEFAULT = 90         # sin cambio


def _ventana_web(db: Session) -> tuple[int, int, int]:
    """(anticipacion_minima_horas, horizonte_maximo_dias, duracion_maxima_dias),
    leídos de `configuracion`. Una sola función para los cuatro endpoints que
    los necesitan — la ventana no puede decir una cosa en `/disponibilidad` y
    otra en `/config`."""
    from app.services.configuracion_service import ConfiguracionService

    cfg = ConfiguracionService(db)
    return (
        cfg.get_int("web.anticipacion_minima_horas", _ANTICIPACION_MINIMA_HORAS_DEFAULT),
        cfg.get_int("web.horizonte_maximo_dias", _HORIZONTE_MAXIMO_DIAS_DEFAULT),
        cfg.get_int("web.duracion_maxima_dias", _DURACION_MAXIMA_DIAS_DEFAULT),
    )


_EDAD_MINIMA_DEFAULT = 21


def _validar_edad_minima(db: Session, edad: int | None) -> None:
    """
    D-51 (plan de conexión, 13/08) — **revierte D-38**. La web rechaza a un
    conductor de menos de `alquiler.edad_minima` en vez de sólo recargarle el
    precio. `edad=None` no valida nada: en los pasos donde todavía no se
    declaró, no hay nada que rechazar todavía.
    """
    if edad is None:
        return
    from app.services.configuracion_service import ConfiguracionService

    minima = ConfiguracionService(db).get_int("alquiler.edad_minima", _EDAD_MINIMA_DEFAULT)
    if edad < minima:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Para alquilar online hay que ser mayor de {minima} años. "
                "Escribinos por WhatsApp y lo vemos con un agente comercial."
            ),
        )


@router.get("/disponibilidad", dependencies=[Depends(limite_consultas)])
def get_disponibilidad(
    fecha_inicio: date = Query(..., description="Retiro, ISO YYYY-MM-DD"),
    fecha_fin: date = Query(..., description="Devolución, ISO YYYY-MM-DD"),
    hora_inicio: time = Query(time(10, 0)),
    hora_fin: time = Query(time(10, 0)),
    # `ge=16` es sólo el piso de entrada (que un `edad=-5` no llegue al motor
    # de precios) — el rechazo real por debajo de los 21 (D-51, revierte
    # D-38) lo hace `_validar_edad_minima` más abajo, leyendo
    # `alquiler.edad_minima` de configuración.
    edad: int | None = Query(
        None, ge=16, le=110,
        description="Edad declarada del responsable. Se usa para validar la edad mínima (D-51); no cambia el precio",
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
    anticipacion, horizonte, duracion_maxima = _ventana_web(db)
    try:
        validar_rango_web(
            inicio_dt, fin_dt, datetime.now(),
            anticipacion_minima_horas=anticipacion,
            duracion_maxima_dias=duracion_maxima,
            horizonte_maximo_dias=horizonte,
        )
    except ValueError as e:
        # 422 con el texto tal cual: está redactado para mostrárselo al cliente.
        raise HTTPException(status_code=422, detail=str(e))
    _validar_edad_minima(db, edad)

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

    **Las coberturas van ordenadas por franquicia descendente** (D-53, §3.8b
    punto 4): primero la que menos baja el riesgo, al final la que más —
    "pagando más, te llevás menos riesgo" es la lectura que la escalera tiene
    que comunicar. Antes se ordenaban por `orden`/`nombre`, que no dice nada
    de eso. Los extras siguen ordenados como antes: no tienen escalera.
    """
    items = (
        db.query(Adicional)
        .filter(Adicional.activo.is_(True), Adicional.visible_web.is_(True))
        .order_by(Adicional.grupo, Adicional.orden, Adicional.nombre)
        .all()
    )
    coberturas = sorted(
        (a for a in items if a.grupo == "cobertura"),
        key=lambda a: a.franquicia if a.franquicia is not None else Decimal("Infinity"),
        reverse=True,
    )
    extras = [a for a in items if a.grupo != "cobertura"]
    ordenados = coberturas + extras

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
            "porcentaje_sobre_alquiler": a.porcentaje_sobre_alquiler,
            "max_cantidad": a.max_cantidad,
        }
        for a in ordenados
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

    **Devuelve los dos escenarios de precio, no uno.** El paso 4 tiene que
    mostrar los tres montos —30%, 50% y 100%— y cada uno sale de un precio
    distinto: con seña parcial se paga el de lista, y con el 100% corre el
    descuento por duración (D-49). Antes se devolvía sólo el escenario pedido y
    el navegador estimaba los otros dos multiplicando: el 100% aparecía sin
    descuento y el cliente **no veía cuánta plata se ahorraba pagando todo**,
    que es justamente lo que lo hace cambiar de opción. Sólo bajaba al tocarlo,
    cuando ya había decidido.

    Se resuelve acá y no en el navegador por la misma razón de siempre: hay un
    solo motor de precios. `anticipos` sale de `calcular_anticipo`, la misma
    función pura que después decide cuánto se le cobra de verdad al cliente en
    `PagoWebService`, así que los tres botones muestran el monto exacto que va
    a la pasarela y no una estimación parecida.
    """
    from app.core.exceptions import BusinessRuleError as _BRE
    from app.domain.pagos_web import (
        CLAVE_DESCUENTO_PAGO_TOTAL, DESCUENTO_PAGO_TOTAL_DEFAULT,
        PORCENTAJES_ANTICIPO, calcular_anticipo,
    )
    from app.services.configuracion_service import ConfiguracionService
    from app.services.precio_service import PrecioService

    if payload.fecha_fin <= payload.fecha_inicio:
        raise HTTPException(422, "La fecha de fin debe ser posterior a la de inicio")

    # D-51: la edad real (`fecha_nacimiento`) manda sobre la declarada, mismo
    # criterio que el resto del motor de precios (ver `PrecioService.calcular`).
    if payload.fecha_nacimiento is not None:
        from app.domain.edades import calcular_edad
        _validar_edad_minima(db, calcular_edad(payload.fecha_nacimiento, payload.fecha_inicio))
    else:
        _validar_edad_minima(db, payload.edad)

    svc = PrecioService(db)
    elegidos = [(a.adicional_id, a.cantidad) for a in payload.adicionales]

    def _cotizar(anticipo: int | None):
        return svc.calcular(
            fecha_inicio=payload.fecha_inicio,
            fecha_fin=payload.fecha_fin,
            categoria_id=payload.categoria_id,
            vehiculo_id=None,
            canal="web",
            adicionales=elegidos,
            fecha_nacimiento=payload.fecha_nacimiento,
            edad_conductor=payload.edad,
            porcentaje_anticipo=anticipo,
        )

    try:
        c100, categoria_id = _cotizar(100)
        # Sin descuento por duración las dos cotizaciones son idénticas —el
        # anticipo no toca nada más del precio—, así que se ahorra la segunda
        # pasada por el motor en vez de calcular dos veces lo mismo.
        lista = c100 if not c100.descuento_monto else _cotizar(None)[0]
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except _BRE as e:
        raise HTTPException(status_code=422, detail=str(e))

    # La cotización "principal" —el desglose que el resumen muestra línea por
    # línea— es la del escenario que el cliente eligió. `aplica_descuento_por_
    # duracion` sólo distingue el 100% del resto, así que son estas dos.
    cotizacion = c100 if payload.porcentaje_anticipo == 100 else lista

    # D-30: un descuento adicional por pagar todo hoy, que los dueños mueven
    # desde `configuracion` sin deploy. Va arriba del de duración.
    pct_pago_total = ConfiguracionService(db).get_decimal(
        CLAVE_DESCUENTO_PAGO_TOTAL, DESCUENTO_PAGO_TOTAL_DEFAULT
    )
    anticipos = []
    for pct in PORCENTAJES_ANTICIPO:
        base = c100.total if pct == 100 else lista.total
        try:
            a = calcular_anticipo(base, pct, pct_pago_total)
        except ValueError:
            # Total en cero: no hay nada que cobrar y no hay opción que ofrecer.
            continue
        anticipos.append({
            "porcentaje": pct,
            # Lo que termina saliendo el alquiler eligiendo esta opción.
            "total": a.total_final,
            "monto_a_cobrar": a.monto_a_cobrar,
            "saldo": a.saldo,
            "descuento_pago_total": a.descuento,
            # Cuánta plata se ahorra respecto de señar parcial. **En pesos, no
            # en porcentaje**: es el número que hace cambiar de opción.
            "ahorro": lista.total - a.total_final,
        })

    return ok({
        # Lo que sale el alquiler señando parcial: el precio de lista, sin el
        # descuento por duración. Es la base de los montos del 30% y el 50% y
        # el número que se muestra tachado cuando el cliente elige el total.
        "total_lista": lista.total,
        # El mismo alquiler pagando el 100% por adelantado, con la misma forma
        # que `precio.pago_total` de `/public/disponibilidad`. `None` cuando no
        # hay descuento por duración para esta duración.
        "pago_total": (
            {
                "total": c100.total,
                "descuento_monto": c100.descuento_monto,
                "descuento_porcentaje": c100.descuento_porcentaje,
                "descuento_nombre": c100.descuento_nombre,
            }
            if c100.descuento_monto and c100.total < lista.total
            else None
        ),
        "anticipos": anticipos,
        "dias": [d.__dict__ for d in cotizacion.dias],
        "duracion_dias": cotizacion.duracion_dias,
        "subtotal": cotizacion.subtotal,
        "descuento_porcentaje": cotizacion.descuento_porcentaje,
        "descuento_monto": cotizacion.descuento_monto,
        "descuento_nombre": cotizacion.descuento_nombre,
        "subtotal_vehiculo": cotizacion.subtotal_vehiculo,
        "adicionales": [a.__dict__ for a in cotizacion.adicionales],
        "total_adicionales": cotizacion.total_adicionales,
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

    _anticipacion, _horizonte, _duracion_maxima = _ventana_web(db)

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
        "anticipacion_minima_horas": _anticipacion,
        "horizonte_maximo_dias": _horizonte,
        "duracion_maxima_dias": _duracion_maxima,
        # D-10/D-56 (plan de conexión 13/08): salen de `configuracion`, no
        # hardcodeados — y es la ÚNICA fuente: el front ya no tiene su propio
        # fallback duplicado (`LUGARES_FALLBACK` se borró). D-39 sigue
        # aplicando — sólo Bahía Blanca, CABA se saca del flujo online.
        "lugares_retiro": [
            lugar.strip()
            for lugar in ConfiguracionService(db).get_str(
                "web.lugares_retiro", "Paraguay 241,Alsina 350,Aeropuerto Comandante Espora"
            ).split(",")
            if lugar.strip()
        ],
        "hold_minutos": HOLD_MINUTOS_DEFAULT,
        # Cobro por transferencia. Los datos salen de `configuracion` y no del
        # código de la web: un CBU pisado en el front es un CBU que un día
        # cambia y nadie corrige, y el síntoma es la plata de un cliente yendo
        # a una cuenta que ya no existe.
        "transferencia": _datos_transferencia(db),
        # D-61: el panel de derivación ofrece tres canales, y los tres salían
        # de constantes del front — el WhatsApp incluso hardcodeado adentro del
        # propio cartel. Mismo criterio que los lugares y los plazos: si el
        # número cambia, se cambia en Configuración y no en un deploy.
        "contacto": _datos_contacto(db),
    })


def _datos_contacto(db: Session) -> dict:
    """Los canales que la web ofrece cuando no puede cerrar la venta sola.

    Los defaults son los valores actuales: si la migración 069 todavía no
    corrió, la web sigue mostrando los números correctos en vez de un hueco.
    """
    from app.services.configuracion_service import ConfiguracionService

    cfg = ConfiguracionService(db)
    return {
        "whatsapp": cfg.get_str("contacto.whatsapp", "5492914180554"),
        "whatsapp_display": cfg.get_str("contacto.whatsapp_display", "+54 9 291 418-0554"),
        # Mismo número que el WhatsApp (14/08): quien llama en vez de escribir
        # tiene que caer en la línea que atiende las reservas.
        "telefono": cfg.get_str("contacto.telefono", "+5492914180554"),
        "email": cfg.get_str("contacto.email", "ubicar.rent@gmail.com"),
    }


def _datos_transferencia(db: Session) -> dict | None:
    """
    La cuenta a la que el cliente transfiere, o `None` si no está habilitada.

    Devuelve `None` también si falta el CBU: mostrar un alias sin CBU es
    invitar a una transferencia que no se puede completar.
    """
    # El import va acá dentro, igual que en `get_config_publica`: este módulo
    # los hace locales para no arrastrar servicios pesados al arranque. Estaba
    # tomado del scope de la otra función y **rompía `/public/config` con un
    # 500**, que es el endpoint del que cuelga toda la web.
    from app.services.configuracion_service import ConfiguracionService

    cfg = ConfiguracionService(db)
    if cfg.get_str("cobro.transferencia_habilitada", "false").lower() not in ("true", "1"):
        return None

    cbu = cfg.get_str("cobro.banco_cbu", "")
    if not cbu:
        return None

    return {
        "titular": cfg.get_str("cobro.banco_titular", ""),
        "alias": cfg.get_str("cobro.banco_alias", ""),
        "cbu": cbu,
        "cuenta": cfg.get_str("cobro.banco_cuenta", ""),
        "cuit": cfg.get_str("cobro.banco_cuit", ""),
        "whatsapp_comprobante": cfg.get_str("cobro.whatsapp_comprobante", ""),
    }


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
    anticipacion, horizonte, duracion_maxima = _ventana_web(db)
    try:
        validar_rango_web(
            inicio_dt, fin_dt, datetime.now(),
            anticipacion_minima_horas=anticipacion,
            duracion_maxima_dias=duracion_maxima,
            horizonte_maximo_dias=horizonte,
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
    anticipacion, horizonte, duracion_maxima = _ventana_web(db)
    try:
        validar_rango_web(
            inicio_dt, fin_dt, datetime.now(),
            anticipacion_minima_horas=anticipacion,
            duracion_maxima_dias=duracion_maxima,
            horizonte_maximo_dias=horizonte,
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
    from app.models.cliente import NOMBRE_CLIENTE_GENERICO, Cliente
    from app.models.usuario import AUTH_SUB_SISTEMA, Usuario

    # D-53 (§4.3): se busca primero el registro "de sistema" explícito, y se
    # cae al más viejo por id si el script de limpieza todavía no lo creó —
    # mismo criterio que `PagoWebService._usuario_sistema`.
    usuario_sistema = (
        db.query(Usuario).filter(Usuario.auth_sub == AUTH_SUB_SISTEMA).first()
        or db.query(Usuario).order_by(Usuario.id).first()
    )
    cliente_generico = (
        db.query(Cliente).filter(Cliente.nombre_completo == NOMBRE_CLIENTE_GENERICO).first()
        or db.query(Cliente).order_by(Cliente.id).first()
    )
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
    # Plan de conexión (13/08), punto 1.4: antes esto avisaba sólo por
    # campana. Un contacto sin cupo es una venta a recuperar — tiene que
    # salir el mail igual que los otros dos caminos de reserva web.
    try:
        from app.services.email_reservas import avisar_al_equipo_solicitud_sin_cupo
        avisar_al_equipo_solicitud_sin_cupo(db, reserva)
    except Exception:
        logger.exception("[Solicitudes] falló el mail de la solicitud sin cupo #%s", reserva.id)
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


@router.post("/reservas/transferencia", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limite_solicitudes)])
def crear_reserva_transferencia(payload: ReservaWebRequest, db: Session = Depends(get_db)):
    """
    Reserva a pagar por **transferencia bancaria**.

    Es el mismo camino que el checkout de Mercado Pago —mismo hold, mismo
    recálculo de precio del lado del servidor, misma reserva en
    `pendiente_pago`— con una diferencia central: **acá no hay webhook**. Nadie
    le avisa al sistema que la plata llegó, así que la reserva **no se confirma
    sola**. Alguien del equipo concilia el comprobante contra el extracto y la
    confirma desde el sistema.

    Por eso la respuesta lleva los datos de la cuenta y el WhatsApp al que
    mandar el comprobante: el cliente tiene que salir de acá sabiendo **qué
    hacer** y **que todavía no tiene el auto reservado**.

    El cupo lo sostiene el hold mientras tanto, igual que en el otro camino: si
    la transferencia no llega antes de que venza, el auto se libera.
    """
    from app.services.pago_web_service import PagoWebService

    datos_banco = _datos_transferencia(db)
    if datos_banco is None:
        raise HTTPException(
            status_code=503,
            detail="El pago por transferencia no está disponible en este momento. "
                   "Escribinos por WhatsApp y cerramos la reserva.",
        )

    try:
        resultado = PagoWebService(db).reservar_para_transferencia(
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
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except NotFoundError as e:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=_mensaje(e))

    return ok({**resultado, "banco": datos_banco})


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
    background: BackgroundTasks,
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

    # **La firma se guarda y se contesta. Los avisos van después.**
    #
    # Antes esto corría dentro del request: generar el PDF y mandar dos mails
    # con el adjunto, con el SDK de Resend que es síncrono y sin timeout. El
    # cliente veía "Firmando…" **uno o dos minutos** con el dedo todavía en la
    # pantalla, sin saber si había quedado — que es justo el momento en que
    # alguien recarga y vuelve a firmar.
    #
    # Ahora se responde apenas la firma está en la base, que es lo único que
    # el cliente necesita saber, y el aviso sale por atrás. Si el mail falla,
    # queda registrado y se reintenta desde el panel: la firma ya está.
    db.commit()
    contrato_id = contrato.id
    background.add_task(_avisar_contrato_firmado_en_segundo_plano, contrato_id)

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


def _avisar_contrato_firmado_en_segundo_plano(contrato_id: int) -> None:
    """
    Los avisos de la firma, ya fuera del request.

    **Abre su propia sesión**: la del endpoint se cierra al devolver la
    respuesta, así que reusarla acá daría un error de sesión cerrada apenas la
    tarea corra un milisegundo tarde.

    Envuelto entero en un `try`: esto se ejecuta cuando ya no hay a quién
    devolverle un error. Lo único que corresponde es dejarlo en el log — el
    contrato ya está firmado y guardado.
    """
    from app.database import SessionLocal
    from app.models.contrato import Contrato

    db = SessionLocal()
    try:
        contrato = db.get(Contrato, contrato_id)
        if contrato is None:
            return
        _avisar_contrato_firmado(db, contrato)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[Contratos] fallaron los avisos de firma de %s", contrato_id)
    finally:
        db.close()


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


# Con límite: es el único endpoint público que **hace una llamada saliente a
# la API de Mercado Pago por cada request**, así que sin tope era un
# amplificador gratis para consumirnos la cuota desde afuera.
#
# Se usa `limite_consultas` (60/min) y no `limite_solicitudes` (5 cada 5 min):
# los avisos legítimos llegan en ráfaga cuando entran varios pagos juntos, y
# frenarlos convertiría el arreglo en el problema. Sesenta por minuto desde una
# misma IP ya es abuso — con ese volumen de cobros habría otras cosas que mirar.
@router.post("/webhooks/mercadopago", dependencies=[Depends(limite_consultas)])
async def webhook_mercadopago(request: Request, db: Session = Depends(get_db)):
    """
    Notificación de Mercado Pago. **Es la fuente de verdad del cobro.**

    **Siempre responde 200**, incluso ante un error nuestro. Un webhook que
    devuelve 500 hace que Mercado Pago reintente en bucle durante horas; lo que
    no se pudo resolver queda marcado como `revision` y salta una alerta, que
    es una forma mucho mejor de enterarse.

    **La firma no es lo que sostiene la seguridad de esto.** El cuerpo sólo
    trae un id, y el pago se vuelve a leer contra la API con nuestras
    credenciales: alguien que invente un `payment_id` no consigue nada. La
    validación de `x-signature` está para que no nos hagan consultar la API de
    Mercado Pago a discreción, y por eso **se salta sola si no hay secreto
    cargado** — ver `domain/webhook_mp.py`.
    """
    from app.services.pago_web_service import PagoWebService

    try:
        cuerpo = await request.json()
    except Exception:
        cuerpo = {}

    query = dict(request.query_params)
    payment_id = _extraer_payment_id(cuerpo, query)
    if not payment_id:
        # Mercado Pago manda también notificaciones de otros temas (merchant
        # orders, por ejemplo). No son un error: simplemente no nos interesan.
        return ok({"resultado": "ignorado"}, "Notificación sin pago asociado")

    if not _firma_valida(request, cuerpo, query, payment_id):
        # 401 y no 200, que es la única excepción a la regla de "siempre 200".
        #
        # El riesgo real acá no es el aviso falso —no puede confirmar nada— es
        # **que el secreto esté mal cargado y estemos rechazando avisos
        # legítimos**. Con 200 eso sería invisible: el panel de Mercado Pago
        # seguiría en verde mientras ninguna reserva se confirma. Con 401 el
        # panel marca el webhook en rojo, que es la única señal que existe.
        # Se loguea el header y el manifiesto —no el secreto— porque con eso
        # se diagnostica sin necesidad de que entre otro pago: si el
        # manifiesto es el esperado y aun así no coincide, el secreto es de
        # otro ambiente; si el manifiesto está raro, cambió el formato.
        from app.domain.webhook_mp import manifiesto, parsear_x_signature

        firma = request.headers.get("x-signature")
        ts, _ = parsear_x_signature(firma)
        logger.error(
            "[MercadoPago] firma inválida para payment_id=%s — si esto se repite, "
            "revisá MERCADOPAGO_WEBHOOK_SECRET contra el panel (el de prueba y el "
            "de producción son distintos). Sólo se valida el formato nuevo "
            "(type=payment). x-signature=%r manifiesto=%r",
            payment_id, firma,
            manifiesto(query.get("data.id") or payment_id,
                       request.headers.get("x-request-id") or "", ts or ""),
        )
        raise HTTPException(status_code=401, detail="Firma inválida")

    try:
        resultado = PagoWebService(db).procesar_webhook(payment_id)
    except Exception:
        db.rollback()
        logger.exception("[MercadoPago] falló el webhook para payment_id=%s", payment_id)
        return ok({"resultado": "error_registrado"}, "Recibido")

    return ok(resultado, "Recibido")


def _firma_valida(request: Request, cuerpo: dict, query: dict, payment_id: str) -> bool:
    """
    Chequea el header `x-signature` contra el secreto del panel.

    **El `data.id` que Mercado Pago firma es el del query string**, no el del
    cuerpo. Cuando no viene por la URL —pasa según el tipo de aviso— se cae al
    que se extrajo del cuerpo, que es el mismo número.

    Los avisos del formato viejo (`topic=payment`) **no se validan**: Mercado
    Pago los manda con `x-signature` pero no los firma con este secreto, así
    que rechazarlos era rechazar avisos legítimos. Ver `lleva_firma`.
    """
    from app.domain.webhook_mp import firma_valida, lleva_firma

    if not lleva_firma(cuerpo, query):
        return True

    return firma_valida(
        secreto=settings.mercadopago_webhook_secret,
        x_signature=request.headers.get("x-signature"),
        x_request_id=request.headers.get("x-request-id"),
        data_id=query.get("data.id") or payment_id,
    )


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


# ─── Demanda insatisfecha (§3.9) ─────────────────────────────────────────────

MotivoBusquedaSinResultado = Literal[
    "sin_cupo", "anticipacion", "horizonte", "duracion", "otro_lugar",
]
# D-61: `telefono` y `mail` son los dos canales que el panel de derivación
# sumó al lado de WhatsApp. Sin ellos en la unión, un click en "Llamar" volvía
# 422 y la demanda no quedaba registrada en ningún lado.
BotonElegido = Literal["whatsapp", "telefono", "mail", "seguir_web", "consulta"]


class BusquedaSinResultadoRequest(BaseModel):
    """
    Lo que el cartel de derivación comercial (§3.9) registra cada vez que
    aparece — **no** es una consulta, no lleva contacto. Ver
    `models/busqueda_sin_resultado.py`.
    """
    motivo: MotivoBusquedaSinResultado
    boton_elegido: BotonElegido
    categoria_id: int | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None


@router.post("/estadisticas/busqueda-sin-resultado", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limite_consultas)])
def registrar_busqueda_sin_resultado(
    payload: BusquedaSinResultadoRequest, db: Session = Depends(get_db),
):
    """
    Plan de conexión (13/08), §3.9 — la mitad de D-04 que sobrevive al
    cartel: sin esto, la demanda insatisfecha sólo se mediría para la
    minoría que completa el formulario de contacto, que ahora es la tercera
    opción y no la única.

    Sin autenticación, como el resto de `/public`, y **sin devolver nada que
    el cliente necesite**: es fire-and-forget desde el navegador, y si falla
    no tiene que romper el cartel que lo disparó.
    """
    from app.models.busqueda_sin_resultado import BusquedaSinResultado

    registro = BusquedaSinResultado(
        categoria_id=payload.categoria_id,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        motivo=payload.motivo,
        boton_elegido=payload.boton_elegido,
    )
    db.add(registro)
    db.commit()
    return ok({"id": registro.id}, "Registrado")


MotivoSolicitudContacto = Literal["fuera_de_ventana", "sin_cupo", "otro_lugar"]


class SolicitudContactoRequest(BaseModel):
    """
    "Quiero que me contacten ustedes" — la segunda salida del panel de
    derivación (D-61). Ver `models/solicitud_contacto.py`.

    **Casi todo es opcional a propósito.** Quien pide una llamada puede no
    haber elegido categoría (fuera de ventana), puede no tener fechas todavía,
    y el mail es opcional porque el pedido es que lo llamen. Lo único que hace
    falta de verdad es cómo ubicarlo.
    """
    motivo: MotivoSolicitudContacto
    nombre: str = Field(min_length=2, max_length=255)
    telefono: str = Field(min_length=6, max_length=30)
    email: str | None = None
    categoria_id: int | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    lugar_retiro: str | None = None
    lugar_devolucion: str | None = None
    lugar_texto_libre: str | None = None
    edad_declarada: int | None = None
    notas: str | None = None


@router.post("/contacto", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limite_solicitudes)])
def crear_solicitud_contacto(
    payload: SolicitudContactoRequest, db: Session = Depends(get_db),
):
    """
    Registra un pedido de llamada. **No valida la ventana de venta** (D-61).

    Esa omisión es el punto entero de este endpoint. `/public/solicitudes`
    llama a `validar_rango_web` y rechaza con 422 exactamente el caso que lo
    invoca: la persona ve el panel *porque* sus fechas están fuera de la
    ventana, y después el formulario del panel le dice que sus fechas están
    fuera de la ventana. Es un 422 autoinfligido, y era lo que D-59 dejó
    anotado como "generalizarlo pide un endpoint propio".

    La ventana existe para impedir que la web **venda** fuera de rango. Acá no
    hay venta que impedir: no se toma cupo, no se cobra, no se ocupa
    calendario. Se anota un teléfono.

    Tampoco valida edad mínima ni existencia de cupo, por lo mismo. Lo único
    que se chequea es higiene de datos —que haya con qué llamar y que las
    fechas no estén dadas vuelta—, porque un registro que no se puede guardar
    es un contacto perdido, que es justo lo que esto vino a evitar.

    Endpoint nuevo y no un flag `saltear_ventana=true` sobre el viejo: un
    booleano que apaga una validación de negocio, en una ruta pública y sin
    autenticación, es una puerta que se abre desde la consola del navegador.
    """
    from app.models.solicitud_contacto import SolicitudContacto

    if payload.fecha_inicio and payload.fecha_fin and payload.fecha_fin <= payload.fecha_inicio:
        raise HTTPException(
            status_code=422, detail="La devolución tiene que ser posterior al retiro.",
        )

    solicitud = SolicitudContacto(
        motivo=payload.motivo,
        nombre=payload.nombre.strip(),
        telefono=payload.telefono.strip(),
        email=(payload.email or "").strip() or None,
        categoria_id=payload.categoria_id,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        hora_inicio=payload.hora_inicio,
        hora_fin=payload.hora_fin,
        lugar_retiro=payload.lugar_retiro,
        lugar_devolucion=payload.lugar_devolucion,
        lugar_texto_libre=payload.lugar_texto_libre,
        edad_declarada=payload.edad_declarada,
        notas=payload.notas,
        estado="pendiente",
    )
    db.add(solicitud)
    db.flush()

    # El aviso y el mail no pueden voltear el guardado: si falla el correo, la
    # solicitud ya está en la base y el mostrador la ve igual en la bandeja.
    try:
        from app.services.notificacion_service import NotificacionService
        NotificacionService(db).avisar_solicitud_contacto(solicitud)
    except Exception:
        logger.exception("[Contacto] falló el aviso de la solicitud #%s", solicitud.id)
    try:
        from app.services.email_reservas import avisar_al_equipo_solicitud_contacto
        avisar_al_equipo_solicitud_contacto(db, solicitud)
    except Exception:
        logger.exception("[Contacto] falló el mail de la solicitud #%s", solicitud.id)

    db.commit()
    return ok(
        {"id": solicitud.id},
        "Listo, lo tenemos anotado. Un agente de Ubicar te va a escribir.",
    )
