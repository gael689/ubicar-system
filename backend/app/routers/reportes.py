from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, extract
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.reserva import Reserva
from app.models.alquiler import Alquiler
from app.models.pago import Pago
from app.models.gasto import Gasto
from app.models.categoria import Categoria
from app.models.cliente import Cliente

router = APIRouter(prefix="/reportes", tags=["Reportes"])


@router.get("/dashboard")
def dashboard_stats(
    fecha: str = Query(None, description="YYYY-MM-DD para filtrar flujo del día"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    hoy_date = date.fromisoformat(fecha) if fecha else date.today()
    # today fallback for stat blocks
    real_today = date.today()

    disponibles = db.query(Vehiculo).filter(Vehiculo.estado == "disponible", Vehiculo.activo == True).count()
    alquilados = db.query(Vehiculo).filter(Vehiculo.estado == "alquilado", Vehiculo.activo == True).count()
    reservados = db.query(Vehiculo).filter(Vehiculo.estado == "reservado", Vehiculo.activo == True).count()
    fuera = db.query(Vehiculo).filter(Vehiculo.estado == "fuera_de_servicio", Vehiculo.activo == True).count()
    total_activos = db.query(Vehiculo).filter(Vehiculo.activo == True).count()

    ocupacion_pct = round((alquilados / total_activos * 100) if total_activos > 0 else 0, 1)

    # ==========================
    # FLUJO DEL DÍA (filtrado por `hoy_date`)
    # ==========================
    flujo_del_dia = []

    # 0. Reservas creadas hoy
    reservas_creadas = db.query(Reserva).filter(
        func.date(Reserva.created_at) == hoy_date
    ).all()
    for r in reservas_creadas:
        c = db.get(Cliente, r.cliente_id)
        v = db.get(Vehiculo, r.vehiculo_id)
        hora_real = r.created_at.strftime("%H:%M")
        hora_prog = r.hora_inicio.strftime("%H:%M") if r.hora_inicio else ""
        flujo_del_dia.append({
            "tipo": "nueva_reserva",
            "hora": hora_real,
            "hora_real": hora_real,
            "hora_programada": hora_prog,
            "descripcion": f"Reserva #{r.id} creada ({c.nombre_completo if c else '?'}) p/ {v.marca if v else ''} {v.modelo if v else ''}",
            "monto": r.precio_total,
            "reserva_id": r.id
        })

    # 1. Entregas programadas / realizadas hoy (Check-in / Checkout para cliente)
    entregas_hoy = db.query(Reserva).filter(
        Reserva.fecha_inicio == hoy_date,
        Reserva.estado.in_(["confirmada", "activa", "vencida", "finalizada"])
    ).all()
    for r in entregas_hoy:
        c = db.get(Cliente, r.cliente_id)
        v = db.get(Vehiculo, r.vehiculo_id)
        hora_prog = r.hora_inicio.strftime("%H:%M") if r.hora_inicio else "00:00"
        
        alq = db.query(Alquiler).filter(Alquiler.reserva_id == r.id).first()
        hora_real = alq.checkout_hora.strftime("%H:%M") if alq and alq.checkout_hora else None
        
        estado_texto = "Entrega prog." if r.estado == "confirmada" else "Vehículo entregado"
        flujo_del_dia.append({
            "tipo": "check_out",
            "hora": hora_real if hora_real else hora_prog,
            "hora_real": hora_real,
            "hora_programada": hora_prog,
            "descripcion": f"{estado_texto} #{r.id} ({c.nombre_completo if c else '?'}) p/ {v.marca if v else ''} {v.modelo if v else ''}",
            "monto": r.precio_total,
            "reserva_id": r.id
        })

    # 2. Devoluciones programadas / realizadas / vencidas hoy (Check-out / Checkin para cliente)
    devoluciones_hoy = db.query(Reserva).filter(
        Reserva.fecha_fin == hoy_date,
        Reserva.estado.in_(["activa", "vencida", "finalizada"])
    ).all()
    for r in devoluciones_hoy:
        c = db.get(Cliente, r.cliente_id)
        v = db.get(Vehiculo, r.vehiculo_id)
        hora_prog = r.hora_fin.strftime("%H:%M") if r.hora_fin else "00:00"

        alq = db.query(Alquiler).filter(Alquiler.reserva_id == r.id).first()
        hora_real = alq.checkin_hora.strftime("%H:%M") if alq and alq.checkin_hora else None

        if r.estado == "activa":
            estado_texto = "Devolución prog."
        elif r.estado == "vencida":
            estado_texto = "Devolución vencida"
        else:
            estado_texto = "Devolución recibida"
        flujo_del_dia.append({
            "tipo": "devolucion",
            "hora": hora_real if hora_real else hora_prog,
            "hora_real": hora_real,
            "hora_programada": hora_prog,
            "descripcion": f"{estado_texto} #{r.id} ({c.nombre_completo if c else '?'}) - {v.patente if v else ''}",
            "reserva_id": r.id
        })

    # 3. Pagos de la fecha
    pagos_hoy = db.query(Pago).filter(Pago.fecha == hoy_date).all()
    for p in pagos_hoy:
        alq = db.get(Alquiler, p.alquiler_id) if p.alquiler_id else None
        r = db.get(Reserva, alq.reserva_id) if alq else None
        hora = "12:00" # Pago no tiene time field actualmente
        desc = f"Cobro ${p.monto} ({p.medio_pago})"
        if r:
            c = db.get(Cliente, r.cliente_id)
            desc += f" - R#{r.id} {c.nombre_completo if c else ''}"
        flujo_del_dia.append({
            "tipo": "pago",
            "hora": hora,
            "hora_real": None,
            "hora_programada": None,
            "descripcion": desc,
            "monto": p.monto,
            "reserva_id": r.id if r else None
        })

    # 4. Gastos de la fecha
    gastos_hoy = db.query(Gasto).filter(Gasto.fecha == hoy_date).all()
    for g in gastos_hoy:
        hora = "12:00"
        flujo_del_dia.append({
            "tipo": "gasto",
            "hora": hora,
            "hora_real": None,
            "hora_programada": None,
            "descripcion": f"Gasto ${g.monto} ({g.categoria}) - {g.descripcion}",
            "monto": -g.monto
        })

    # Ordenar por hora descendente
    flujo_del_dia.sort(key=lambda x: x["hora"], reverse=True)

    return ok({
        "vehiculos_disponibles": disponibles,
        "vehiculos_alquilados": alquilados,
        "vehiculos_reservados": reservados,
        "vehiculos_fuera_servicio": fuera,
        "total_vehiculos_activos": total_activos,
        "ocupacion_porcentaje": ocupacion_pct,
        "flujo_del_dia": flujo_del_dia,
    })


@router.get("/ingresos")
def reporte_ingresos(
    anio: int = Query(..., ge=2020),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Ingresos mensuales del año indicado, desglosados por medio de pago."""
    meses = []
    for mes in range(1, 13):
        pagos_mes = db.query(Pago).filter(
            extract("year", Pago.fecha) == anio, extract("month", Pago.fecha) == mes,
        ).all()
        gastos_mes = db.query(Gasto).filter(
            extract("year", Gasto.fecha) == anio, extract("month", Gasto.fecha) == mes,
        ).all()

        total_ingresos = sum(float(p.monto) for p in pagos_mes)
        total_egresos = sum(float(g.monto) for g in gastos_mes)

        por_medio: dict[str, float] = {}
        for p in pagos_mes:
            por_medio[p.medio_pago] = por_medio.get(p.medio_pago, 0.0) + float(p.monto)

        meses.append({
            "mes": mes,
            "mes_label": [
                "Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
            ][mes - 1],
            "ingresos": total_ingresos,
            "egresos": total_egresos,
            "margen": total_ingresos - total_egresos,
            "por_medio_pago": por_medio,
        })

    return ok({"anio": anio, "meses": meses})


@router.get("/flota")
def reporte_flota(
    fecha_desde: date = Query(..., description="ISO YYYY-MM-DD"),
    fecha_hasta: date = Query(..., description="ISO YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Utilización por vehículo en el período indicado.

    **Cuatro consultas, no una por vehículo.** Antes esto era un N+1 anidado en
    tres niveles: una consulta por vehículo para sus reservas, otra por reserva
    para su alquiler, otra por alquiler para sus pagos, y otra por vehículo
    para sus gastos. Con diez autos y veinte reservas cada uno eran más de
    cuatrocientas consultas para dibujar una tabla de diez filas — y crecía con
    el histórico, no con lo que se está mirando.

    Ahora: una consulta de vehículos, una de reservas del período con su
    alquiler ya cargado, una de pagos agregados por alquiler y una de gastos
    agregados por vehículo. Las dos sumas las hace Postgres con `SUM()`, que es
    donde tienen que hacerse.

    **La plata se suma en `Decimal`**, no en `float`. El total de un reporte que
    acumula cientos de importes con coma no puede depender de cómo redondea el
    punto flotante.
    """
    vehiculos = db.query(Vehiculo).filter(Vehiculo.activo == True).all()
    if not vehiculos:
        return ok([])
    vehiculo_ids = [v.id for v in vehiculos]

    # Las reservas del período, de todos los autos de una vez, con el alquiler
    # ya cargado: es lo que evita la consulta por fila del segundo nivel.
    reservas = (
        db.query(Reserva)
        .options(joinedload(Reserva.alquiler))
        .filter(
            Reserva.vehiculo_id.in_(vehiculo_ids),
            Reserva.estado.in_(["activa", "vencida", "finalizada"]),
            Reserva.fecha_inicio <= fecha_hasta,
            Reserva.fecha_fin >= fecha_desde,
        )
        .all()
    )

    # Los pagos, sumados por alquiler en la base. Traerlos para sumarlos en
    # Python era el tercer nivel del N+1.
    alquiler_ids = [r.alquiler.id for r in reservas if r.alquiler]
    pagos_por_alquiler: dict[int, Decimal] = {}
    if alquiler_ids:
        pagos_por_alquiler = {
            aid: total or Decimal("0")
            for aid, total in db.query(Pago.alquiler_id, func.sum(Pago.monto))
            .filter(Pago.alquiler_id.in_(alquiler_ids))
            .group_by(Pago.alquiler_id)
            .all()
        }

    # Los gastos, también agregados por la base.
    gastos_por_vehiculo: dict[int, Decimal] = {
        vid: total or Decimal("0")
        for vid, total in db.query(Gasto.vehiculo_id, func.sum(Gasto.monto))
        .filter(
            Gasto.vehiculo_id.in_(vehiculo_ids),
            Gasto.fecha >= fecha_desde,
            Gasto.fecha <= fecha_hasta,
        )
        .group_by(Gasto.vehiculo_id)
        .all()
    }

    reservas_por_vehiculo: dict[int, list[Reserva]] = {vid: [] for vid in vehiculo_ids}
    for r in reservas:
        if r.vehiculo_id in reservas_por_vehiculo:
            reservas_por_vehiculo[r.vehiculo_id].append(r)

    dias_periodo = (fecha_hasta - fecha_desde).days + 1
    resultado = []

    for v in vehiculos:
        de_este = reservas_por_vehiculo[v.id]

        dias_alquilados = 0
        ingresos_vehiculo = Decimal("0")
        for r in de_este:
            # Días del período que efectivamente se solapan (ambos son date).
            inicio = max(r.fecha_inicio, fecha_desde)
            fin = min(r.fecha_fin, fecha_hasta)
            if fin >= inicio:
                dias_alquilados += (fin - inicio).days + 1
            if r.alquiler:
                ingresos_vehiculo += pagos_por_alquiler.get(r.alquiler.id, Decimal("0"))

        gastos_vehiculo = gastos_por_vehiculo.get(v.id, Decimal("0"))
        ocupacion_pct = round(
            (dias_alquilados / dias_periodo * 100) if dias_periodo > 0 else 0, 1
        )

        resultado.append({
            "vehiculo_id": v.id,
            "patente": v.patente,
            "marca": v.marca,
            "modelo": v.modelo,
            "tipo": v.tipo,
            "alquileres_count": len(de_este),
            "dias_alquilados": dias_alquilados,
            "ocupacion_porcentaje": min(ocupacion_pct, 100.0),
            "ingresos": ingresos_vehiculo,
            "gastos": gastos_vehiculo,
            "margen": ingresos_vehiculo - gastos_vehiculo,
        })

    resultado.sort(key=lambda x: x["ocupacion_porcentaje"], reverse=True)
    return ok(resultado)


MOTIVO_LABEL = {
    "sin_cupo": "No había unidades",
    "anticipacion": "Pidió con muy poca anticipación",
    "horizonte": "Pidió para muy adelante",
    "duracion": "Alquiler más largo del máximo",
    "otro_lugar": "Quería otro lugar de retiro",
    "sin_franquicia": "Categoría sin franquicia cargada",
}


@router.get("/demanda-no-atendida")
def demanda_no_atendida(
    desde: date | None = Query(None, description="YYYY-MM-DD"),
    hasta: date | None = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Qué pidió la gente en el sitio y no se le pudo vender.

    **Es el único dato que mide lo que se pierde.** Cada vez que el sitio no
    puede cerrar una reserva —no hay cupo, la fecha está fuera de la ventana de
    venta, el lugar no es uno de los tres— aparece el cartel que deriva a
    WhatsApp, y esa búsqueda queda registrada. La mayoría de esa gente no
    completa ningún formulario, así que sin esta tabla el negocio sólo vería la
    minoría que sí lo hace.

    Contesta dos preguntas distintas y por eso agrupa por dos ejes:

    - **Por categoría**: qué auto conviene comprar. Es literalmente para lo que
      D-04 pidió medir esto.
    - **Por motivo**: si lo que falta es flota o si son las propias reglas de la
      ventana de venta las que están dejando ventas afuera. Un pico en
      `anticipacion` no se arregla comprando autos: se arregla bajando los diez
      días.

    Sin rango, mira los últimos 90 días: es lo que hace que el número signifique
    algo para decidir hoy, en vez de arrastrar el histórico entero.
    """
    from app.models.busqueda_sin_resultado import BusquedaSinResultado

    hasta_efectivo = hasta or date.today()
    desde_efectivo = desde or (hasta_efectivo - timedelta(days=90))

    filas = (
        db.query(BusquedaSinResultado)
        .filter(
            func.date(BusquedaSinResultado.created_at) >= desde_efectivo,
            func.date(BusquedaSinResultado.created_at) <= hasta_efectivo,
        )
        .all()
    )

    categorias = {c.id: c.nombre for c in db.query(Categoria).all()}

    por_categoria: dict[str, int] = {}
    por_motivo: dict[str, int] = {}
    for f in filas:
        # `None` es una búsqueda que ni siquiera llegó a elegir categoría —
        # típico de las que se caen por fecha. Se cuenta aparte para no
        # inflar ninguna categoría real.
        nombre = categorias.get(f.categoria_id) if f.categoria_id else "Sin categoría elegida"
        por_categoria[nombre] = por_categoria.get(nombre, 0) + 1
        por_motivo[f.motivo] = por_motivo.get(f.motivo, 0) + 1

    return ok({
        "desde": desde_efectivo.isoformat(),
        "hasta": hasta_efectivo.isoformat(),
        "total": len(filas),
        "por_categoria": [
            {"categoria": k, "consultas": v}
            for k, v in sorted(por_categoria.items(), key=lambda x: -x[1])
        ],
        "por_motivo": [
            {"motivo": k, "label": MOTIVO_LABEL.get(k, k), "consultas": v}
            for k, v in sorted(por_motivo.items(), key=lambda x: -x[1])
        ],
    })
