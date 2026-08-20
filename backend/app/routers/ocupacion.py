from __future__ import annotations
"""
Router de Ocupación — endpoint del calendario.
GET /api/v1/ocupacion — devuelve vehículos + eventos para el timeline.
"""
from datetime import date, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.bloqueo_vehiculo import BloqueoVehiculo
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.services.reserva_service import MOTIVO_BLOQUEO_LABEL
from app.repositories.reserva_repo import ReservaRepo
from app.schemas.ocupacion import (
    EventoOcupacion, FechaEspecialOcupacion, OcupacionResponse, VehiculoOcupacionItem,
)
from app.schemas.reserva import ReservaResponse

router = APIRouter(prefix="/ocupacion", tags=["Ocupación"])


@router.get("")
def get_ocupacion(
    fecha_inicio: date = Query(...),
    fecha_fin: date = Query(...),
    vehiculo_ids: list[int] | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Devuelve la estructura de ocupación para el calendario.
    Incluye vehículos activos y sus reservas/alquileres en el rango de fechas.
    """
    # Vehículos activos
    q = (
        db.query(Vehiculo)
        # Sin esto, resolver el nombre de la categoría de cada auto sería una
        # consulta por fila.
        .options(joinedload(Vehiculo.categoria))
        .filter(Vehiculo.activo == True)
    )
    if vehiculo_ids:
        q = q.filter(Vehiculo.id.in_(vehiculo_ids))
    vehiculos = q.order_by(Vehiculo.patente).all()
    vehiculo_ids_activos = [v.id for v in vehiculos]

    # **El calendario no escribe.** Acá se llamaba a
    # `sincronizar_estados_por_horario()`, que hace dos UPDATE masivos y un
    # COMMIT. El calendario es la pantalla de inicio (D-24): cada vez que
    # alguien entraba, cambiaba de mes o volvía a la pestaña, se disparaban
    # escrituras sobre la tabla más consultada del sistema, con tres personas
    # trabajando a la vez. Lo hace el scheduler cada 5 minutos — ver `main.py`
    # y el comentario de `ReservaService.list`.

    # Reservas en el rango
    reserva_repo = ReservaRepo(db)
    reservas = reserva_repo.find_para_ocupacion(fecha_inicio, fecha_fin, vehiculo_ids_activos)

    # Plan de conexión (13/08), cierra C-1: una reserva sin auto asignado no
    # tiene fila de vehículo donde dibujarse. Se separan acá — `eventos` es
    # sólo lo que tiene `vehiculo_id`, y lo demás va a `sin_asignar`, que el
    # front muestra como panel aparte (2.2). Sin este split, la única forma
    # de encontrar una reserva web confirmada sin auto era acordarse de
    # entrar a otra pantalla.
    eventos: list[EventoOcupacion] = []
    sin_asignar: list[ReservaResponse] = []
    for r in reservas:
        if r.vehiculo_id is None:
            sin_asignar.append(ReservaResponse.model_validate(r))
            continue
        eventos.append(EventoOcupacion(
            id=r.id,
            vehiculo_id=r.vehiculo_id,
            tipo="reserva",
            estado=r.estado,
            fecha_inicio=r.fecha_inicio,
            hora_inicio=r.hora_inicio,
            fecha_fin=r.fecha_fin,
            hora_fin=r.hora_fin,
            cliente_nombre=r.cliente.nombre_completo if r.cliente else "",
            lugar_entrega=r.lugar_entrega,
            lugar_devolucion=r.lugar_devolucion,
            precio_total=float(r.precio_total) if r.precio_total else None,
            notas=r.notas,
            tiene_alquiler=r.alquiler is not None,
            origen=r.origen,
            # Sólo para las de mostrador: en una reserva web el `usuario` es el
            # usuario "Sistema", que no le dice nada a nadie. Ahí el front
            # muestra "Sitio web", que es la información verdadera.
            creado_por=(
                r.usuario.nombre if r.origen != "web" and r.usuario else ""
            ),
        ))

    # Bloqueos (mantenimiento, siniestro, uso interno). Van al calendario
    # porque ocupan el vehículo igual que una reserva: si el auto está en el
    # taller la semana que viene, eso cambia cómo se planifica la flota, y no
    # verlo es exactamente lo que lleva a prometer un auto que no está.
    bloqueos = (
        db.query(BloqueoVehiculo)
        .filter(
            BloqueoVehiculo.activo.is_(True),
            BloqueoVehiculo.vehiculo_id.in_(vehiculo_ids_activos),
            BloqueoVehiculo.fecha_desde <= fecha_fin,
            BloqueoVehiculo.fecha_hasta >= fecha_inicio,
        )
        .all()
    )
    for b in bloqueos:
        eventos.append(EventoOcupacion(
            id=b.id,
            vehiculo_id=b.vehiculo_id,
            tipo="bloqueo",
            estado=b.motivo,
            fecha_inicio=b.fecha_desde,
            hora_inicio=time.min,
            # El rango del bloqueo es inclusivo, así que ocupa el último día
            # completo — de ahí el 23:59.
            fecha_fin=b.fecha_hasta,
            hora_fin=time(23, 59),
            cliente_nombre=MOTIVO_BLOQUEO_LABEL.get(b.motivo, b.motivo),
            notas=b.notas,
        ))

    # Plan de conexión (13/08), cierra C-11: las fechas especiales existen
    # justamente para verse acá — "que el administrador las VEA en el
    # calendario de ocupación" es la función #1 declarada del modelo — y hoy
    # no llegaban. Se traen las que solapan el rango pedido.
    from app.models.fecha_especial import FechaEspecial
    fechas_especiales = (
        db.query(FechaEspecial)
        .filter(
            FechaEspecial.activo.is_(True),
            FechaEspecial.fecha_desde <= fecha_fin,
            FechaEspecial.fecha_hasta >= fecha_inicio,
        )
        .all()
    )

    return ok(OcupacionResponse(
        vehiculos=[
            VehiculoOcupacionItem(
                id=v.id, patente=v.patente, marca=v.marca, modelo=v.modelo,
                estado=v.estado, activo=v.activo,
                categoria_id=v.categoria_id,
                categoria_nombre=v.categoria.nombre if v.categoria else None,
            )
            for v in vehiculos
        ],
        eventos=eventos,
        sin_asignar=sin_asignar,
        fechas_especiales=[FechaEspecialOcupacion.model_validate(f) for f in fechas_especiales],
    ))


@router.get("/resumen-anual")
def get_resumen_anual(
    anio: int = Query(..., ge=2020, le=2100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Plan de conexión (13/08), cierra 2.8 — la pre-vista anual del calendario
    de ocupación (la misma idea que la grilla de 12 meses de Fechas
    especiales, que es la que le gustó al dueño).

    **Una fila por día, agregada en SQL — no el año entero de `/ocupacion`.**
    Pedirle al endpoint normal 365 días traería la flota completa por cada
    evento del año para terminar reduciéndolo a un número por día en el
    navegador. Acá se cuenta directamente: cuántos vehículos activos están
    ocupados, cuántas entregas y devoluciones hay, cuántas alertas activas
    tienen `fecha_objetivo` ese día, y cuántas reservas siguen sin auto.
    """
    from sqlalchemy import func

    from app.domain.enums import EstadoReserva
    from app.models.bloqueo_vehiculo import BloqueoVehiculo
    from app.models.notificacion import Notificacion
    from app.models.reserva import Reserva

    un_dia = timedelta(days=1)
    desde = date(anio, 1, 1)
    hasta = date(anio, 12, 31)

    total_vehiculos = db.query(func.count(Vehiculo.id)).filter(Vehiculo.activo.is_(True)).scalar() or 0

    ESTADOS_OCUPAN = [
        EstadoReserva.PENDIENTE.value, EstadoReserva.CONFIRMADA.value,
        EstadoReserva.ACTIVA.value, EstadoReserva.VENCIDA.value,
    ]
    # El año se pinta **por estado**, no por densidad: `finalizada` se suma acá
    # aunque no ocupe, porque la leyenda la promete y un mes pasado sin color
    # se lee como un mes sin trabajo.
    #
    # `cancelada` queda afuera a propósito, y no es una omisión de esta vista:
    # la consulta que alimenta el timeline (`reserva_repo`) tampoco la trae.
    # La anual es una pre-vista del timeline — si pintara un día por una
    # cancelada, al hacer click no habría nada que mirar.
    ESTADOS_VISIBLES = ESTADOS_OCUPAN + [EstadoReserva.FINALIZADA.value]
    reservas = (
        db.query(Reserva)
        .join(Vehiculo, Vehiculo.id == Reserva.vehiculo_id)
        .filter(
            Vehiculo.activo.is_(True),
            Reserva.estado.in_(ESTADOS_VISIBLES),
            Reserva.fecha_inicio <= hasta,
            Reserva.fecha_fin >= desde,
        )
        .all()
    )
    bloqueos = (
        db.query(BloqueoVehiculo)
        .join(Vehiculo, Vehiculo.id == BloqueoVehiculo.vehiculo_id)
        .filter(
            Vehiculo.activo.is_(True),
            BloqueoVehiculo.activo.is_(True),
            BloqueoVehiculo.fecha_desde <= hasta,
            BloqueoVehiculo.fecha_hasta >= desde,
        )
        .all()
    )
    sin_asignar_reservas = (
        db.query(Reserva)
        .filter(
            Reserva.vehiculo_id.is_(None),
            Reserva.estado == EstadoReserva.CONFIRMADA.value,
            Reserva.fecha_inicio <= hasta,
            Reserva.fecha_fin >= desde,
        )
        .all()
    )
    alertas = (
        db.query(Notificacion.fecha_objetivo, func.count(Notificacion.id))
        .filter(
            Notificacion.estado.in_(("pendiente", "enviada", "pospuesta")),
            Notificacion.fecha_objetivo.isnot(None),
            Notificacion.fecha_objetivo >= desde,
            Notificacion.fecha_objetivo <= hasta,
        )
        .group_by(Notificacion.fecha_objetivo)
        .all()
    )
    alertas_por_dia = {f: c for f, c in alertas}

    dias: dict[date, dict] = {}
    d = desde
    while d <= hasta:
        dias[d] = {
            "fecha": d.isoformat(), "ocupados": 0, "total": total_vehiculos,
            "entregas": 0, "devoluciones": 0,
            "alertas": alertas_por_dia.get(d, 0),
            "sin_asignar": 0,
            # Estado → cuántos ese día. **Mismo vocabulario que
            # `EventoOcupacion.estado`**: estados de reserva y motivos de
            # bloqueo en el mismo diccionario, para que el front pinte con una
            # sola tabla de colores y no aparezca vocabulario nuevo.
            "estados": {},
        }
        d += un_dia

    def _sumar_estado(dia: date, estado: str) -> None:
        dias[dia]["estados"][estado] = dias[dia]["estados"].get(estado, 0) + 1

    for r in reservas:
        ocupa = r.estado in ESTADOS_OCUPAN
        cursor = max(r.fecha_inicio, desde)
        # El día de devolución no cuenta como ocupado (mismo criterio que el
        # resto del sistema: [fecha_inicio, fecha_fin) es el rango que cobra),
        # pero **sí se pinta**: el timeline dibuja la barra hasta ese día
        # inclusive, y si acá no coincidiera, un día pintado en el año
        # llevaría a un timeline vacío.
        limite = min(r.fecha_fin, hasta + un_dia)
        while cursor < limite:
            if ocupa:
                dias[cursor]["ocupados"] += 1
            _sumar_estado(cursor, r.estado)
            cursor += un_dia
        if desde <= r.fecha_fin <= hasta:
            _sumar_estado(r.fecha_fin, r.estado)
        if desde <= r.fecha_inicio <= hasta:
            dias[r.fecha_inicio]["entregas"] += 1
        if desde <= r.fecha_fin <= hasta:
            dias[r.fecha_fin]["devoluciones"] += 1

    # Un auto en el taller tampoco está disponible. Antes no se contaba y el
    # "8 de 15 ocupados" del tooltip venía mintiendo por defecto.
    for b in bloqueos:
        cursor = max(b.fecha_desde, desde)
        limite = min(b.fecha_hasta, hasta)
        while cursor <= limite:
            dias[cursor]["ocupados"] += 1
            _sumar_estado(cursor, b.motivo)
            cursor += un_dia

    for r in sin_asignar_reservas:
        cursor = max(r.fecha_inicio, desde)
        limite = min(r.fecha_fin, hasta + un_dia)
        while cursor < limite:
            dias[cursor]["sin_asignar"] += 1
            cursor += un_dia

    return ok({"anio": anio, "dias": list(dias.values())})

