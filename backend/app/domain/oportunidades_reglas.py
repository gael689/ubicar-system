"""
Oportunidades 💡 — sugerencias para ganar plata o no perderla.

El pedido (21/11/2026): *"que el sistema sugiera oportunidades o cosas que le
pueden servir a una rentadora de autos […] que diga cuando está un auto parado
hace mucho tiempo"*.

**No hay IA ni servicios externos**: son reglas puras sobre datos que el
sistema ya tiene. Cada una dice qué pasa, cuánto vale más o menos y qué hacer.

Mismo contrato que `notificaciones_reglas.py` —`(db, hoy) -> list[dict]`, sin
tocar la sesión— más un dict `datos` opcional que viaja hasta la pantalla:

    "datos": {
        "impacto": 180000,                          # pesos estimados
        "impacto_label": "≈ $180.000 sin facturar",
        "accion": "Ver el auto",                    # texto del botón
        "whatsapp": "https://wa.me/…?text=…",       # opcional
        ...
    }

Corren en el mismo motor que los avisos (`NotificacionService.generar`): misma
tabla, así que ya tienen dedupe, posponer, descartar y auto-resolución cuando
dejan de aplicar. **No suman a la campana**: tienen su propia pestaña.

Lo que quedó afuera a propósito:

- **Fines de semana largos que nadie cargó.** `op_fecha_fuerte_con_autos_libres`
  mira la tabla de Fechas especiales; el sistema no tiene un calendario de
  feriados propio y no se inventa uno.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib.parse import quote

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.domain.avisos_catalogo import accion_de
from app.models.alquiler import Alquiler
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.busqueda_sin_resultado import BusquedaSinResultado
from app.models.categoria import Categoria
from app.models.cliente import Cliente
from app.models.configuracion import Configuracion
from app.models.danio import Danio
from app.models.fecha_especial import FechaEspecial
from app.models.multa import Multa
from app.models.presupuesto import Presupuesto
from app.models.prospecto import Prospecto
from app.models.reserva import Reserva
from app.models.vehiculo import Vehiculo
from app.services import cobranza_service as cobranza
from app.services.disponibilidad_service import ESTADOS_QUE_OCUPAN

logger = logging.getLogger(__name__)

# ── Umbrales ─────────────────────────────────────────────────────────────────
#
# Todos en un solo lugar. Cada uno se puede pisar desde la tabla
# `configuracion` con la clave `oportunidades.<nombre>` (entero); si la clave no
# existe o no es un número, vale el de acá.
PREFIJO_CONFIG = "oportunidades."

UMBRALES: dict[str, int] = {
    # Auto parado: días sin salir para avisar, y a partir de cuántos sube a
    # urgencia media. "Sin reservas a la vista" mira esta cantidad de días.
    "auto_parado_dias": 10,
    "auto_parado_dias_urgente": 30,
    "auto_parado_sin_reserva_dias": 7,
    # El impacto se estima con un tope: un auto que lleva 200 días parado no
    # "perdió" 200 días de alquiler, y un número absurdo le saca seriedad al resto.
    "auto_parado_tope_impacto_dias": 30,
    # Extensión: cuántos días libres tiene que tener el auto después.
    "extension_dias_libres": 3,
    # Clientes para volver a contactar.
    "recontactar_min_alquileres": 2,
    "recontactar_desde_dias": 90,
    "recontactar_hasta_dias": 540,
    "recontactar_maximo": 15,
    # Fecha fuerte con autos libres.
    "fecha_fuerte_horizonte_dias": 21,
    "fecha_fuerte_ocupacion_max_pct": 50,
    "fecha_fuerte_tope_impacto_dias": 3,
    # Demanda de la web que no encontró auto.
    "demanda_ventana_dias": 14,
    "demanda_min_busquedas": 3,
    # Cotizaciones que no cerraron.
    "cotizacion_desde_dias": 2,
    "cotizacion_hasta_dias": 10,
    # Categoría casi completa.
    "ocupacion_alta_pct": 85,
    "ocupacion_alta_horizonte_dias": 14,
    # Con un solo auto, "100 % ocupada" no dice nada.
    "ocupacion_alta_min_autos": 2,
    # Prospectos listos para una campaña.
    "prospectos_minimo": 20,
}

# El link de reseñas de Google. Vacío por defecto: sin link, el mensaje de
# WhatsApp pide la reseña igual pero no lo incluye.
CLAVE_URL_RESENAS = "oportunidades.url_resenas_google"

# Cada cuántos días se vuelve a sugerir algo que alguien descartó ("No me
# sirve") o que se resolvió solo. Más largo que el de los avisos (7 días): una
# sugerencia que vuelve todas las semanas deja de ser una sugerencia.
REAVISO_DIAS_OPORTUNIDAD = 21
REAVISO_DIAS_POR_TIPO: dict[str, int] = {
    "op_auto_parado": 21,
    "op_cliente_para_recontactar": 60,
    "op_cotizacion_sin_cerrar": 21,
    "op_prospectos_sin_contactar": 21,
    # Atadas a una fecha: si vuelven a aplicar es por otras fechas.
    "op_extension_posible": 7,
    "op_fecha_fuerte_con_autos_libres": 7,
    "op_demanda_sin_cupo": 7,
    "op_ocupacion_alta": 7,
    "op_auto_uber_libre": 7,
    # Es un resumen por día: el de mañana es otro.
    "op_pedir_resena": 1,
}

# Los estados de una reserva que todavía "está viva" para un cliente: ocupa un
# auto o está por ocuparlo.
_ESTADOS_RESERVA_VIVA = (*ESTADOS_QUE_OCUPAN, "pendiente_pago", "revision_sin_cupo")

_MOTIVO_BUSQUEDA = {
    "sin_cupo": "sin cupo",
    "anticipacion": "por fecha muy cercana",
    "horizonte": "por fecha muy lejana",
    "duracion": "por la duración",
    "otro_lugar": "por el lugar de entrega",
}
# Motivos que no se arreglan con más autos sino cambiando cómo vende el sitio.
_MOTIVOS_DE_REGLAS_DE_VENTA = {"anticipacion", "horizonte", "duracion"}


# ── Piezas compartidas ───────────────────────────────────────────────────────

def _umbrales(db: Session) -> dict[str, int]:
    """Los umbrales, con lo que haya en `configuracion` pisando el default."""
    valores = dict(UMBRALES)
    filas = (
        db.query(Configuracion.clave, Configuracion.valor)
        .filter(Configuracion.clave.like(f"{PREFIJO_CONFIG}%"))
        .all()
    )
    for clave, valor in filas:
        nombre = clave[len(PREFIJO_CONFIG):]
        if nombre not in valores:
            continue
        try:
            valores[nombre] = int(str(valor).strip())
        except (TypeError, ValueError):
            pass  # un valor mal cargado no puede romper la regla: vale el default
    return valores


def _pesos(monto) -> str:
    """`180000` → `$180.000`. Sin centavos: son estimaciones."""
    return "$" + f"{int(round(float(monto))):,}".replace(",", ".")


def _dm(d: date) -> str:
    return f"{d.day}/{d.month}"


def _auto(v) -> str:
    return f"{v.marca} {v.modelo} {v.patente}" if v else "auto"


def _nombre_de_pila(nombre: str | None) -> str:
    """Para saludar por WhatsApp: "Juan Pérez" → "Juan". Una razón social
    ("Constructora Sur SA") se deja entera."""
    limpio = (nombre or "").strip()
    if not limpio:
        return ""
    if any(s in limpio.upper().split() for s in ("SA", "SRL", "SAS", "S.A.", "S.R.L.")):
        return limpio
    return limpio.split()[0].title()


def link_whatsapp(telefono: str | None, mensaje: str) -> str | None:
    """
    El link que abre el chat con el mensaje ya escrito, o `None` sin teléfono.

    **Se abre, no se manda solo**: quien atiende aprieta enviar. Mismo criterio
    que el resto del sistema para el número: `wa.me` quiere sólo dígitos y no se
    intenta adivinar el formato.
    """
    digitos = "".join(ch for ch in (telefono or "") if ch.isdigit())
    if len(digitos) < 8:
        return None
    return f"https://wa.me/{digitos}?text={quote(mensaje)}"


def _oportunidad(
    tipo: str, titulo: str, descripcion: str, entidad_tipo: str, entidad_id: int,
    url_destino: str, hoy: date, urgencia: str = "baja", **datos,
) -> dict:
    datos = {k: v for k, v in datos.items() if v is not None}
    datos.setdefault("accion", accion_de(tipo))
    return {
        "tipo": tipo,
        "titulo": titulo[:255],
        "descripcion": descripcion,
        "urgencia": urgencia,
        "entidad_tipo": entidad_tipo,
        "entidad_id": entidad_id,
        "url_destino": url_destino,
        # `hoy`, como el resto de los avisos de estado continuo: el motor deja
        # una sola fila por (tipo, entidad) y le refresca el texto.
        "fecha_objetivo": hoy,
        "datos": datos,
    }


def _flota_de_alquiler(db: Session) -> list[Vehiculo]:
    """Los autos que se alquilan en el mostrador: activos y no destinados a Uber."""
    return (
        db.query(Vehiculo)
        .filter(Vehiculo.activo.is_(True), Vehiculo.destino != "uber")
        .all()
    )


def _precios_del_dia(db: Session, hoy: date) -> dict[int, Decimal]:
    """
    Precio diario vigente por categoría, del mismo motor que pinta la grilla de
    Precios. Si no se puede calcular, la oportunidad sale igual pero sin monto:
    un impacto inventado es peor que ninguno.
    """
    try:
        from app.services.precio_service import PrecioService

        precios: dict[int, Decimal] = {}
        for fila in PrecioService(db).calendario(hoy, hoy):
            precio = fila["dias"][0]["precio"] if fila["dias"] else None
            if precio is not None and Decimal(str(precio)) > 0:
                precios[fila["categoria_id"]] = Decimal(str(precio))
        return precios
    except Exception:
        logger.exception("[Oportunidades] No se pudo leer el precio del día")
        return {}


def _ocupacion_por_dia(
    db: Session, desde: date, hasta: date, flota: list[Vehiculo],
) -> dict[date, dict]:
    """
    Qué está ocupado cada día del rango `[desde, hasta]`.

    Por día devuelve `{"vehiculos": {ids ocupados}, "sin_asignar": {categoria_id: n}}`.
    Una reserva ocupa desde el día que sale hasta el anterior al que vuelve (el
    día de la devolución el auto ya puede salir de nuevo); un bloqueo ocupa los
    dos extremos. Las reservas sin auto asignado (las de la web) cuentan por
    categoría: van a necesitar una unidad aunque todavía no se sepa cuál.
    """
    ids = {v.id for v in flota}
    dias = {
        desde + timedelta(days=i): {"vehiculos": set(), "sin_asignar": {}}
        for i in range((hasta - desde).days + 1)
    }
    reservas = (
        db.query(
            Reserva.vehiculo_id, Reserva.categoria_id, Reserva.fecha_inicio, Reserva.fecha_fin,
        )
        .filter(
            Reserva.estado.in_(ESTADOS_QUE_OCUPAN),
            Reserva.fecha_inicio <= hasta,
            Reserva.fecha_fin >= desde,
        )
        .all()
    )
    for vehiculo_id, categoria_id, inicio, fin in reservas:
        ultimo = max(inicio, fin - timedelta(days=1))
        d = max(inicio, desde)
        while d <= min(ultimo, hasta):
            if vehiculo_id is None:
                if categoria_id is not None:
                    sin = dias[d]["sin_asignar"]
                    sin[categoria_id] = sin.get(categoria_id, 0) + 1
            elif vehiculo_id in ids:
                dias[d]["vehiculos"].add(vehiculo_id)
            d += timedelta(days=1)

    bloqueos = (
        db.query(BloqueoVehiculo.vehiculo_id, BloqueoVehiculo.fecha_desde, BloqueoVehiculo.fecha_hasta)
        .filter(
            BloqueoVehiculo.activo.is_(True),
            BloqueoVehiculo.fecha_desde <= hasta,
            BloqueoVehiculo.fecha_hasta >= desde,
        )
        .all()
    )
    for vehiculo_id, b_desde, b_hasta in bloqueos:
        if vehiculo_id not in ids:
            continue
        d = max(b_desde, desde)
        while d <= min(b_hasta, hasta):
            dias[d]["vehiculos"].add(vehiculo_id)
            d += timedelta(days=1)
    return dias


# ── 1. Auto parado ⭐ ─────────────────────────────────────────────────────────

def auto_parado(db: Session, hoy: date) -> list[dict]:
    """
    Un auto disponible que hace rato no sale y no tiene nada a la vista.

    Es la que se pidió con nombre y apellido. "Parado" se cuenta desde la
    última devolución; si nunca salió, desde que se cargó. Y nunca antes de la
    última vez que cambió de estado: un auto que volvió ayer del taller no
    lleva treinta días parado, lleva uno.

    El estado del auto se carga a mano (no pasa solo a "alquilado"), así que
    "está afuera" se mira en las reservas y no en `Vehiculo.estado`.
    """
    u = _umbrales(db)
    candidatos = [v for v in _flota_de_alquiler(db) if v.estado == "disponible"]
    if not candidatos:
        return []
    ids = [v.id for v in candidatos]
    horizonte = hoy + timedelta(days=u["auto_parado_sin_reserva_dias"])

    con_algo_a_la_vista = {
        vid for (vid,) in db.query(Reserva.vehiculo_id).filter(
            Reserva.vehiculo_id.in_(ids),
            Reserva.estado.in_(ESTADOS_QUE_OCUPAN),
            Reserva.fecha_fin >= hoy,
            Reserva.fecha_inicio <= horizonte,
        )
    }
    # Afuera con la devolución atrasada: la reserva terminó "ayer" en los
    # papeles, pero el auto sigue en la calle.
    afuera = {
        vid for (vid,) in db.query(Reserva.vehiculo_id).filter(
            Reserva.vehiculo_id.in_(ids), Reserva.estado.in_(("activa", "vencida")),
        )
    }
    bloqueados = {
        vid for (vid,) in db.query(BloqueoVehiculo.vehiculo_id).filter(
            BloqueoVehiculo.vehiculo_id.in_(ids),
            BloqueoVehiculo.activo.is_(True),
            BloqueoVehiculo.fecha_desde <= horizonte,
            BloqueoVehiculo.fecha_hasta >= hoy,
        )
    }
    ultima_vuelta: dict[int, date] = {}
    filas = (
        db.query(Reserva.vehiculo_id, Reserva.fecha_fin, Alquiler.checkin_fecha)
        .outerjoin(Alquiler, Alquiler.reserva_id == Reserva.id)
        .filter(Reserva.vehiculo_id.in_(ids), Reserva.estado == "finalizada")
        .all()
    )
    for vid, fecha_fin, checkin_fecha in filas:
        vuelta = min(checkin_fecha or fecha_fin, hoy)
        if vid not in ultima_vuelta or vuelta > ultima_vuelta[vid]:
            ultima_vuelta[vid] = vuelta

    precios = _precios_del_dia(db, hoy)
    items = []
    for v in candidatos:
        if v.id in con_algo_a_la_vista or v.id in afuera or v.id in bloqueados:
            continue
        nunca_salio = v.id not in ultima_vuelta
        desde = ultima_vuelta.get(v.id) or (v.created_at.date() if v.created_at else hoy)
        if v.estado_desde:
            desde = max(desde, v.estado_desde.date())
        dias = (hoy - desde).days
        if dias < u["auto_parado_dias"]:
            continue

        precio = precios.get(v.categoria_id) if v.categoria_id else None
        impacto = None
        if precio:
            impacto = float(precio * min(dias, u["auto_parado_tope_impacto_dias"]))
        items.append(_oportunidad(
            "op_auto_parado",
            f"{_auto(v)}: {dias} días parado",
            (
                f"Hace {dias} días que está disponible y nunca salió · sin reservas a la vista"
                if nunca_salio else
                f"Hace {dias} días que no sale · sin reservas a la vista"
            ),
            "vehiculo", v.id, f"/flota/{v.id}", hoy,
            urgencia="media" if dias > u["auto_parado_dias_urgente"] else "baja",
            impacto=impacto,
            impacto_label=f"≈ {_pesos(impacto)} sin facturar" if impacto else None,
            dias_parado=dias,
        ))
    return items


# ── 2. Extensión posible ─────────────────────────────────────────────────────

def extension_posible(db: Session, hoy: date) -> list[dict]:
    """
    Un alquiler que termina hoy o mañana y cuyo auto queda libre después.

    Extender es la venta más barata que hay: el cliente ya tiene el auto y no
    hay que entregarlo ni limpiarlo. Sólo se sugiere si el auto no tiene nada
    en los días siguientes — ofrecer una extensión que después no se puede dar
    es peor que no ofrecerla.
    """
    u = _umbrales(db)
    dias_libres = u["extension_dias_libres"]
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(
            Alquiler.checkin_fecha.is_(None),
            Reserva.estado == "activa",
            Reserva.tipo != "uber",
            Reserva.vehiculo_id.isnot(None),
            Reserva.fecha_fin.in_((hoy, hoy + timedelta(days=1))),
        )
        .all()
    )
    if not alquileres:
        return []
    precios = _precios_del_dia(db, hoy)
    items = []
    for a in alquileres:
        r = a.reserva
        hasta = r.fecha_fin + timedelta(days=dias_libres)
        otra_reserva = db.query(Reserva.id).filter(
            Reserva.id != r.id,
            Reserva.vehiculo_id == r.vehiculo_id,
            Reserva.estado.in_(ESTADOS_QUE_OCUPAN),
            Reserva.fecha_inicio <= hasta,
            Reserva.fecha_fin >= r.fecha_fin,
        ).first()
        bloqueo = db.query(BloqueoVehiculo.id).filter(
            BloqueoVehiculo.vehiculo_id == r.vehiculo_id,
            BloqueoVehiculo.activo.is_(True),
            BloqueoVehiculo.fecha_desde <= hasta,
            BloqueoVehiculo.fecha_hasta >= r.fecha_fin,
        ).first()
        if otra_reserva or bloqueo:
            continue

        cliente = r.cliente
        nombre = cliente.nombre_completo if cliente else "el cliente"
        cuando = "hoy" if r.fecha_fin == hoy else "mañana"
        categoria_id = (r.vehiculo.categoria_id if r.vehiculo else None) or r.categoria_id
        precio = precios.get(categoria_id) if categoria_id else None
        impacto = float(precio * dias_libres) if precio else None
        mensaje = (
            f"Hola {_nombre_de_pila(nombre)}! Te escribimos de Ubicar Rent. "
            f"Tu alquiler termina {cuando} y el auto queda libre unos días más: "
            "si necesitás extenderlo, avisanos y lo dejamos arreglado."
        )
        items.append(_oportunidad(
            "op_extension_posible",
            f"Ofrecele extender a {nombre}",
            (
                f"El {_auto(r.vehiculo)} vuelve {cuando} y queda libre después: "
                f"no tiene otra reserva en los próximos {dias_libres} días."
            ),
            "alquiler", a.id, "/reservas", hoy,
            impacto=impacto,
            impacto_label=f"≈ {_pesos(impacto)} por {dias_libres} días más" if impacto else None,
            whatsapp=link_whatsapp(cliente.telefono if cliente else None, mensaje),
            cliente=nombre,
        ))
    return items


# ── 3. Clientes para volver a contactar ──────────────────────────────────────

def cliente_para_recontactar(db: Session, hoy: date) -> list[dict]:
    """
    Clientes que ya alquilaron varias veces y hace meses que no aparecen.

    Venderle a quien ya alquiló es mucho más fácil que conseguir uno nuevo. Se
    dejan afuera los que ya tienen una reserva en marcha (no hace falta) y los
    que deben plata (no es momento de ofrecerles nada). Sólo los mejores: una
    lista de doscientos nombres no la llama nadie.
    """
    u = _umbrales(db)
    filas = (
        db.query(
            Reserva.cliente_id,
            func.count(Reserva.id),
            func.max(Reserva.fecha_fin),
            func.coalesce(func.sum(Reserva.precio_total), 0),
        )
        .filter(Reserva.estado == "finalizada", Reserva.tipo != "uber")
        .group_by(Reserva.cliente_id)
        .having(func.count(Reserva.id) >= u["recontactar_min_alquileres"])
        .all()
    )
    mas_viejo = hoy - timedelta(days=u["recontactar_hasta_dias"])
    mas_nuevo = hoy - timedelta(days=u["recontactar_desde_dias"])
    elegibles = {
        cid: (cantidad, ultima, Decimal(str(monto or 0)))
        for cid, cantidad, ultima, monto in filas
        if ultima is not None and mas_viejo <= ultima <= mas_nuevo
    }
    if not elegibles:
        return []

    con_reserva = {
        cid for (cid,) in db.query(Reserva.cliente_id).filter(
            Reserva.cliente_id.in_(elegibles),
            Reserva.estado.in_(_ESTADOS_RESERVA_VIVA),
        )
    }
    con_deuda = cobranza.clientes_con_deuda(db)
    clientes = {
        c.id: c for c in db.query(Cliente).filter(
            Cliente.id.in_(elegibles), Cliente.activo.is_(True),
        )
    }
    mejores = sorted(
        (
            (cid, datos) for cid, datos in elegibles.items()
            if cid in clientes and cid not in con_reserva and cid not in con_deuda
        ),
        key=lambda x: (-x[1][0], -x[1][2], x[0]),
    )[: u["recontactar_maximo"]]

    items = []
    for cid, (cantidad, ultima, monto) in mejores:
        c = clientes[cid]
        meses = max(1, (hoy - ultima).days // 30)
        promedio = float(monto / cantidad) if monto > 0 else None
        mensaje = (
            f"Hola {_nombre_de_pila(c.nombre_completo)}! Te escribimos de Ubicar Rent. "
            "Hace un tiempo que no te vemos: si estás por necesitar un auto, "
            "avisanos y te pasamos el mejor precio."
        )
        items.append(_oportunidad(
            "op_cliente_para_recontactar",
            f"Volvé a escribirle a {c.nombre_completo}",
            f"Alquiló {cantidad} veces, la última hace {meses} {'mes' if meses == 1 else 'meses'}.",
            "cliente", cid, f"/clientes/{cid}", hoy,
            impacto=promedio,
            impacto_label=f"≈ {_pesos(promedio)} · su alquiler promedio" if promedio else None,
            whatsapp=link_whatsapp(c.telefono, mensaje),
            cliente=c.nombre_completo,
            alquileres=cantidad,
        ))
    return items


# ── 4. Fecha fuerte con autos libres ─────────────────────────────────────────

def _rango_de_fecha_fuerte(f: FechaEspecial) -> tuple[date, date]:
    """
    El rango que conviene mirar. Un feriado suelto que cae lunes o viernes es
    un fin de semana largo aunque nadie lo haya cargado como tal: se estira
    hasta abarcar el sábado y el domingo.
    """
    desde, hasta = f.fecha_desde, f.fecha_hasta
    if f.tipo == "feriado" and desde == hasta:
        if desde.weekday() == 0:      # lunes → sábado a lunes
            desde -= timedelta(days=2)
        elif desde.weekday() == 4:    # viernes → viernes a domingo
            hasta += timedelta(days=2)
    return desde, hasta


def fecha_fuerte_con_autos_libres(db: Session, hoy: date) -> list[dict]:
    """
    Se viene un feriado o un fin de semana largo y más de la mitad de la flota
    está sin reservar: hay tiempo de publicar una oferta o avisar a los
    clientes de siempre.

    Las temporadas quedan afuera: son rangos de meses, no una fecha para la
    que haya que moverse.
    """
    u = _umbrales(db)
    limite = hoy + timedelta(days=u["fecha_fuerte_horizonte_dias"])
    fechas = (
        db.query(FechaEspecial)
        .filter(
            FechaEspecial.activo.is_(True),
            FechaEspecial.tipo != "temporada",
            FechaEspecial.fecha_desde >= hoy,
            FechaEspecial.fecha_desde <= limite,
        )
        .all()
    )
    if not fechas:
        return []
    flota = [v for v in _flota_de_alquiler(db) if v.estado != "fuera_de_servicio"]
    if not flota:
        return []

    # De más larga a más corta: el feriado que ya está adentro de un fin de
    # semana largo cargado no suma un segundo aviso por lo mismo.
    con_rango = sorted(
        ((f, *_rango_de_fecha_fuerte(f)) for f in fechas),
        key=lambda x: (-(x[2] - x[1]).days, x[1], x[0].id),
    )
    precios = _precios_del_dia(db, hoy)
    cubiertos: list[tuple[date, date]] = []
    items = []
    for f, desde, hasta in con_rango:
        desde = max(desde, hoy)
        if any(d <= desde and hasta <= h for d, h in cubiertos):
            continue
        cubiertos.append((desde, hasta))
        # Un rango muy largo cargado como "comercial" se mira hasta una semana.
        hasta_mirado = min(hasta, desde + timedelta(days=6))
        ocupacion = _ocupacion_por_dia(db, desde, hasta_mirado, flota)
        pico, vehiculos_pico = 0, set()
        for dia in ocupacion.values():
            ocupados = len(dia["vehiculos"]) + sum(dia["sin_asignar"].values())
            if ocupados >= pico:
                pico, vehiculos_pico = ocupados, dia["vehiculos"]
        total = len(flota)
        if pico * 100 >= total * u["fecha_fuerte_ocupacion_max_pct"]:
            continue
        libres = total - pico

        precios_libres = [
            precios[v.categoria_id] for v in flota
            if v.id not in vehiculos_pico and v.categoria_id in precios
        ]
        impacto = None
        if precios_libres:
            dias = min((hasta_mirado - desde).days + 1, u["fecha_fuerte_tope_impacto_dias"])
            promedio = sum(precios_libres) / len(precios_libres)
            impacto = float(promedio * libres * dias)
        rango = f"el {_dm(desde)}" if desde == hasta else f"del {_dm(desde)} al {_dm(hasta)}"
        items.append(_oportunidad(
            "op_fecha_fuerte_con_autos_libres",
            f"{f.nombre} ({_dm(f.fecha_desde)}): {libres} de {total} autos libres",
            (
                f"Todavía hay lugar {rango}. Es buen momento para publicar una oferta "
                "o avisarles a los clientes de siempre."
            ),
            "fecha_especial", f.id, "/ocupacion", hoy,
            impacto=impacto,
            impacto_label=f"hasta ≈ {_pesos(impacto)} si salen todos" if impacto else None,
            libres=libres,
            flota=total,
        ))
    return items


# ── 5. Demanda de la web que no encontró auto ────────────────────────────────

def demanda_sin_cupo(db: Session, hoy: date) -> list[dict]:
    """
    Gente que buscó en el sitio y no encontró nada. Es demanda que hoy no se
    está vendiendo: la mayoría no deja sus datos, así que este registro es lo
    único que la muestra.

    Se agrupa por categoría; las búsquedas que no llegaron a elegir una van
    juntas.
    """
    u = _umbrales(db)
    desde = datetime.combine(hoy - timedelta(days=u["demanda_ventana_dias"]), datetime.min.time())
    filas = db.query(BusquedaSinResultado).filter(BusquedaSinResultado.created_at >= desde).all()
    if not filas:
        return []
    grupos: dict[int, list[BusquedaSinResultado]] = {}
    for f in filas:
        grupos.setdefault(f.categoria_id or 0, []).append(f)
    categorias = {c.id: c.nombre for c in db.query(Categoria).all()}

    items = []
    for categoria_id, busquedas in grupos.items():
        n = len(busquedas)
        if n < u["demanda_min_busquedas"]:
            continue
        por_motivo: dict[str, int] = {}
        for b in busquedas:
            por_motivo[b.motivo] = por_motivo.get(b.motivo, 0) + 1
        ordenados = sorted(por_motivo.items(), key=lambda x: (-x[1], x[0]))
        principal = ordenados[0][0]
        detalle = " · ".join(f"{c} {_MOTIVO_BUSQUEDA.get(m, m)}" for m, c in ordenados)

        # El rango de fechas pedido, si es acotado: "del 12 al 15/12" orienta;
        # "de marzo a noviembre" no.
        inicios = [b.fecha_inicio for b in busquedas if b.fecha_inicio and b.fecha_inicio >= hoy]
        fines = [b.fecha_fin or b.fecha_inicio for b in busquedas if b.fecha_inicio and b.fecha_inicio >= hoy]
        rango = ""
        if inicios and (max(fines) - min(inicios)).days <= 31:
            rango = f" ({_dm(min(inicios))}–{_dm(max(fines))})"

        nombre = categorias.get(categoria_id)
        titulo = (
            f"{n} búsquedas en la web no encontraron {nombre}{rango}" if nombre
            else f"{n} búsquedas en la web quedaron sin resultado{rango}"
        )
        if principal in _MOTIVOS_DE_REGLAS_DE_VENTA:
            accion, url = "Ver cómo vende el sitio", "/canal-web"
            consejo = "No es falta de autos: son las reglas de venta del sitio las que las dejan afuera."
        else:
            accion, url = "Ver bandeja de la web", "/reservas-web"
            consejo = "Es demanda que hoy no se está vendiendo."
        items.append(_oportunidad(
            "op_demanda_sin_cupo", titulo, f"{detalle}. {consejo}",
            "categoria", categoria_id, url, hoy,
            accion=accion, busquedas=n,
        ))
    return items


# ── 6. Cotización que no cerró ───────────────────────────────────────────────

def _fecha_iso(valor: str | None) -> date | None:
    try:
        return date.fromisoformat((valor or "")[:10])
    except ValueError:
        return None


def cotizacion_sin_cerrar(db: Session, hoy: date) -> list[dict]:
    """
    Un presupuesto del cotizador de hace unos días que no terminó en reserva.

    **No hay un vínculo presupuesto → reserva en el modelo**, así que se cruza
    por cliente: si después de cotizarle ese cliente reservó algo (o ya tiene
    una reserva que pisa esas fechas), se da por cerrada. Los presupuestos sin
    cliente cargado quedan afuera: no hay a quién seguir.
    """
    u = _umbrales(db)
    desde = datetime.combine(hoy - timedelta(days=u["cotizacion_hasta_dias"]), datetime.min.time())
    hasta = datetime.combine(hoy - timedelta(days=u["cotizacion_desde_dias"]), datetime.max.time())
    presupuestos = (
        db.query(Presupuesto)
        .filter(
            Presupuesto.cliente_id.isnot(None),
            Presupuesto.estado.in_(("borrador", "enviado")),
            Presupuesto.created_at >= desde,
            Presupuesto.created_at <= hasta,
        )
        .order_by(Presupuesto.created_at.desc())
        .all()
    )
    items = []
    ya_vistos: set[int] = set()
    for p in presupuestos:
        # Uno por cliente: el más nuevo. Tres cotizaciones seguidas a la misma
        # persona son una sola conversación.
        if p.cliente_id in ya_vistos:
            continue
        ya_vistos.add(p.cliente_id)
        inicio, fin = _fecha_iso(p.fecha_inicio), _fecha_iso(p.fecha_fin)
        if inicio is None or fin is None or inicio < hoy:
            continue  # la fecha cotizada ya pasó: no hay nada que seguir
        reservo = db.query(Reserva.id).filter(
            Reserva.cliente_id == p.cliente_id,
            Reserva.estado != "cancelada",
            (Reserva.created_at >= p.created_at)
            | ((Reserva.fecha_inicio <= fin) & (Reserva.fecha_fin >= inicio)),
        ).first()
        if reservo:
            continue
        c = p.cliente
        nombre = c.nombre_completo if c else "el cliente"
        total = float(p.total or 0)
        hace = (hoy - p.created_at.date()).days
        mensaje = (
            f"Hola {_nombre_de_pila(nombre)}! Te escribimos de Ubicar Rent por la cotización "
            f"del {_dm(inicio)} al {_dm(fin)}. ¿La seguimos? Si querés la reservamos ahora "
            "y te aseguramos el auto."
        )
        items.append(_oportunidad(
            "op_cotizacion_sin_cerrar",
            f"Seguí la cotización de {nombre}: {_pesos(total)}",
            f"Le cotizaste {p.dias} días (del {_dm(inicio)} al {_dm(fin)}) hace {hace} días y todavía no reservó.",
            "presupuesto", p.id, "/cotizador", hoy,
            impacto=total if total > 0 else None,
            impacto_label=f"≈ {_pesos(total)} cotizados" if total > 0 else None,
            whatsapp=link_whatsapp(c.telefono if c else None, mensaje),
            cliente=nombre,
        ))
    return items


# ── 7. Categoría casi completa ───────────────────────────────────────────────

def ocupacion_alta(db: Session, hoy: date) -> list[dict]:
    """
    Una categoría con casi todos sus autos reservados en los próximos días.
    Cuando queda una sola unidad, no hace falta regalarla: se puede subir el
    precio o dejar de dar descuento en esas fechas.
    """
    u = _umbrales(db)
    flota = [
        v for v in _flota_de_alquiler(db)
        if v.estado != "fuera_de_servicio" and v.categoria_id is not None
    ]
    por_categoria: dict[int, set[int]] = {}
    for v in flota:
        por_categoria.setdefault(v.categoria_id, set()).add(v.id)
    por_categoria = {
        cid: ids for cid, ids in por_categoria.items() if len(ids) >= u["ocupacion_alta_min_autos"]
    }
    if not por_categoria:
        return []

    hasta = hoy + timedelta(days=u["ocupacion_alta_horizonte_dias"] - 1)
    ocupacion = _ocupacion_por_dia(db, hoy, hasta, flota)
    categorias = {c.id: c.nombre for c in db.query(Categoria).filter(Categoria.id.in_(por_categoria))}

    items = []
    for cid, ids in por_categoria.items():
        total = len(ids)
        # La primera racha de días seguidos por encima del umbral.
        racha: list[tuple[date, int]] = []
        for dia in sorted(ocupacion):
            info = ocupacion[dia]
            ocupados = min(total, len(info["vehiculos"] & ids) + info["sin_asignar"].get(cid, 0))
            if ocupados * 100 >= total * u["ocupacion_alta_pct"]:
                racha.append((dia, ocupados))
            elif racha:
                break
        if not racha:
            continue
        desde, hasta_racha = racha[0][0], racha[-1][0]
        pico = max(o for _, o in racha)
        completa = all(o >= total for _, o in racha)
        cuando = f"el {_dm(desde)}" if desde == hasta_racha else f"del {_dm(desde)} al {_dm(hasta_racha)}"
        nombre = categorias.get(cid, "Categoría")
        items.append(_oportunidad(
            "op_ocupacion_alta",
            f"{nombre} {'completa' if completa else 'casi completa'} {cuando}",
            (
                f"{pico} de {total} autos reservados. Podés subir el precio "
                "o dejar de dar descuento en esas fechas."
            ),
            "categoria", cid, "/precios", hoy,
            ocupados=pico, flota=total,
        ))
    return items


# ── 8. Pedir la reseña ───────────────────────────────────────────────────────

def pedir_resena(db: Session, hoy: date) -> list[dict]:
    """
    Los que devolvieron ayer u hoy sin deber nada y sin daños ni multas: es el
    mejor momento para pedirles la reseña en Google.

    **Un solo aviso por día** con la lista adentro (`datos.clientes`), no uno
    por cliente: es una tarea de cinco minutos que se hace de una vez.
    """
    alquileres = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(
            Alquiler.checkin_fecha.in_((hoy, hoy - timedelta(days=1))),
            Reserva.tipo != "uber",
        )
        .order_by(Alquiler.id)
        .all()
    )
    if not alquileres:
        return []
    ids = [a.id for a in alquileres]
    con_danio = {
        aid for (aid,) in db.query(Danio.alquiler_id).filter(
            Danio.alquiler_id.in_(ids), Danio.activo.is_(True), Danio.momento == "checkin",
        )
    }
    con_multa = {
        aid for (aid,) in db.query(Multa.alquiler_id).filter(
            Multa.alquiler_id.in_(ids), Multa.activo.is_(True),
        )
    }
    from app.services.configuracion_service import ConfiguracionService

    url_resenas = ConfiguracionService(db).get_str(CLAVE_URL_RESENAS, "")

    clientes: list[dict] = []
    vistos: set[int] = set()
    for a in alquileres:
        c = a.reserva.cliente if a.reserva else None
        if c is None or c.id in vistos or a.id in con_danio or a.id in con_multa:
            continue
        if cobranza.saldo_pendiente(db, a) > 0:
            continue
        vistos.add(c.id)
        mensaje = (
            f"Hola {_nombre_de_pila(c.nombre_completo)}! Gracias por elegir Ubicar Rent. "
            "Si te sirvió el servicio, ¿nos dejás una reseña en Google? Nos ayuda un montón."
            + (f"\n{url_resenas}" if url_resenas else "")
        )
        clientes.append({
            "cliente_id": c.id,
            "nombre": c.nombre_completo,
            "whatsapp": link_whatsapp(c.telefono, mensaje),
        })
    if not clientes:
        return []
    n = len(clientes)
    titulo = (
        "1 cliente devolvió sin problemas: pedile la reseña en Google" if n == 1
        else f"{n} clientes devolvieron sin problemas: pediles la reseña en Google"
    )
    return [_oportunidad(
        "op_pedir_resena", titulo,
        ", ".join(c["nombre"] for c in clientes),
        # Entidad sintética estable: es un resumen, no habla de un alquiler.
        "resenas", 0, "/notificaciones?tab=oportunidades", hoy,
        clientes=clientes,
        con_link=bool(url_resenas),
    )]


# ── 9. Prospectos sin contactar ──────────────────────────────────────────────

def prospectos_sin_contactar(db: Session, hoy: date) -> list[dict]:
    """
    Hay una lista de empresas cargada a la que nunca se le escribió. Sólo se
    lee el modelo: la campaña se arma en la pantalla de Prospectos.
    """
    u = _umbrales(db)
    n = (
        db.query(func.count(Prospecto.id))
        .filter(
            Prospecto.estado == "nuevo",
            Prospecto.no_contactar.is_(False),
            Prospecto.email.isnot(None),
            Prospecto.email != "",
            # Los que ya son clientes no entran en una campaña de captación.
            (Prospecto.ya_cliente_id.is_(None)) | (Prospecto.cruce_descartado.is_(True)),
        )
        .scalar()
    ) or 0
    if n < u["prospectos_minimo"]:
        return []
    return [_oportunidad(
        "op_prospectos_sin_contactar",
        f"Tenés {n} empresas listas para escribirles",
        "Son prospectos nuevos con mail a los que todavía no se les escribió. Armá una campaña.",
        "prospectos", 0, "/prospectos", hoy,
        prospectos=n,
    )]


# ── 10. Auto de Uber sin chofer ──────────────────────────────────────────────

def auto_uber_libre(db: Session, hoy: date) -> list[dict]:
    """
    Un auto destinado a Uber que no tiene ningún alquiler de Uber vigente.
    Va al módulo Uber. El monto, si se puede, sale de lo que pagaba por semana
    el último chofer de ese mismo auto.
    """
    autos = (
        db.query(Vehiculo)
        .filter(
            Vehiculo.activo.is_(True),
            Vehiculo.destino == "uber",
            Vehiculo.estado != "fuera_de_servicio",
        )
        .all()
    )
    if not autos:
        return []
    ids = [v.id for v in autos]
    ocupados = {
        vid for (vid,) in db.query(Reserva.vehiculo_id).filter(
            Reserva.vehiculo_id.in_(ids),
            Reserva.estado.in_(ESTADOS_QUE_OCUPAN),
            Reserva.fecha_fin >= hoy,
            # Un alquiler de Uber vigente o por empezar, o cualquier otra
            # reserva que hoy tenga el auto en la calle.
            (Reserva.tipo == "uber") | (Reserva.fecha_inicio <= hoy),
        )
    }
    ocupados |= {
        vid for (vid,) in db.query(Reserva.vehiculo_id).filter(
            Reserva.vehiculo_id.in_(ids), Reserva.estado.in_(("activa", "vencida")),
        )
    }
    items = []
    for v in autos:
        if v.id in ocupados:
            continue
        ultimo_valor = (
            db.query(Reserva.uber_valor_semana)
            .filter(
                Reserva.vehiculo_id == v.id,
                Reserva.tipo == "uber",
                Reserva.uber_valor_semana.isnot(None),
            )
            .order_by(Reserva.fecha_fin.desc())
            .first()
        )
        semana = float(ultimo_valor[0]) if ultimo_valor and ultimo_valor[0] else None
        items.append(_oportunidad(
            "op_auto_uber_libre",
            f"Auto de Uber sin chofer: {_auto(v)}",
            "No tiene ningún alquiler de Uber vigente.",
            "vehiculo", v.id, f"/flota/{v.id}", hoy,
            impacto=semana,
            impacto_label=f"≈ {_pesos(semana)} por semana" if semana else None,
        ))
    return items


# ── Catálogo ─────────────────────────────────────────────────────────────────

# (tipo que emite, regla). El tipo va explícito para que el motor sepa de qué
# regla es cada aviso sin ejecutarla — lo necesita cuando una falla.
REGLAS_OPORTUNIDAD: list[tuple[str, object]] = [
    ("op_auto_parado", auto_parado),
    ("op_extension_posible", extension_posible),
    ("op_cliente_para_recontactar", cliente_para_recontactar),
    ("op_fecha_fuerte_con_autos_libres", fecha_fuerte_con_autos_libres),
    ("op_demanda_sin_cupo", demanda_sin_cupo),
    ("op_cotizacion_sin_cerrar", cotizacion_sin_cerrar),
    ("op_ocupacion_alta", ocupacion_alta),
    ("op_pedir_resena", pedir_resena),
    ("op_prospectos_sin_contactar", prospectos_sin_contactar),
    ("op_auto_uber_libre", auto_uber_libre),
]

TIPOS_OPORTUNIDAD = frozenset(tipo for tipo, _ in REGLAS_OPORTUNIDAD)


def reaviso_dias(tipo: str) -> int:
    return REAVISO_DIAS_POR_TIPO.get(tipo, REAVISO_DIAS_OPORTUNIDAD)


def evaluar_oportunidades(
    db: Session, hoy: date | None = None, reglas: list | None = None,
) -> tuple[list[dict], set[str]]:
    """
    Corre todas las reglas de oportunidad. Devuelve `(candidatos, tipos_fallidos)`.

    **Una regla que falla no tumba nada.** Las oportunidades son un extra: no
    pueden ser el motivo por el que mañana no avise que un auto no volvió. Cada
    regla corre aislada, dentro de un savepoint — en Postgres una consulta que
    falla deja la transacción entera abortada, y sin el savepoint las reglas de
    avisos que corren después fallarían todas por arrastre.

    Los `tipos_fallidos` le sirven al motor para **no auto-resolver** los avisos
    de esa regla: que hoy no haya podido calcularse no quiere decir que el auto
    dejó de estar parado.
    """
    hoy = hoy or date.today()
    candidatos: list[dict] = []
    fallidos: set[str] = set()
    for tipo, regla in (reglas if reglas is not None else REGLAS_OPORTUNIDAD):
        punto = db.begin_nested()
        try:
            nuevos = list(regla(db, hoy))
            punto.commit()
            candidatos.extend(nuevos)
        except Exception:
            logger.exception("[Oportunidades] Falló la regla %s", tipo)
            fallidos.add(tipo)
            if punto.is_active:
                punto.rollback()
    return candidatos, fallidos
