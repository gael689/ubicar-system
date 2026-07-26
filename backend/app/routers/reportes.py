from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.models.reserva import Reserva
from app.models.alquiler import Alquiler
from app.models.pago import Pago
from app.models.gasto import Gasto
from app.models.cliente import Cliente

router = APIRouter(prefix="/reportes", tags=["Reportes"])


@router.get("/dashboard")
def dashboard_stats(
    fecha: str = Query(None, description="YYYY-MM-DD para filtrar flujo del día"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    hoy_date = date.fromisoformat(fecha) if fecha else date.today()
    hoy_str = hoy_date.isoformat()
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
    pagos_hoy = db.query(Pago).filter(Pago.fecha == hoy_str).all()
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
    gastos_hoy = db.query(Gasto).filter(Gasto.fecha == hoy_str).all()
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
        prefijo = f"{anio}-{mes:02d}"

        pagos_mes = db.query(Pago).filter(Pago.fecha.like(f"{prefijo}%")).all()
        gastos_mes = db.query(Gasto).filter(Gasto.fecha.like(f"{prefijo}%")).all()

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
    fecha_desde: str = Query(..., description="ISO YYYY-MM-DD"),
    fecha_hasta: str = Query(..., description="ISO YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Utilización por vehículo en el período indicado."""
    vehiculos = db.query(Vehiculo).filter(Vehiculo.activo == True).all()
    resultado = []

    for v in vehiculos:
        reservas = (
            db.query(Reserva)
            .filter(
                Reserva.vehiculo_id == v.id,
                Reserva.estado.in_(["activa", "vencida", "finalizada"]),
                Reserva.fecha_inicio <= fecha_hasta,
                Reserva.fecha_fin >= fecha_desde,
            )
            .all()
        )

        dias_alquilados = 0
        ingresos_vehiculo = 0.0
        gastos_vehiculo = 0.0

        for r in reservas:
            # Días aproximados del período solapado
            inicio = max(r.fecha_inicio, fecha_desde)
            fin = min(r.fecha_fin, fecha_hasta)
            if fin >= inicio:
                from datetime import date
                try:
                    d_i = date.fromisoformat(inicio)
                    d_f = date.fromisoformat(fin)
                    dias_alquilados += (d_f - d_i).days + 1
                except ValueError:
                    pass

            # Ingresos asociados al alquiler
            alquiler = (
                db.query(Alquiler)
                .filter(Alquiler.reserva_id == r.id)
                .first()
            )
            if alquiler:
                pagos = db.query(Pago).filter(Pago.alquiler_id == alquiler.id).all()
                ingresos_vehiculo += sum(float(p.monto) for p in pagos)

        # Gastos del vehículo en el período
        gastos = (
            db.query(Gasto)
            .filter(
                Gasto.vehiculo_id == v.id,
                Gasto.fecha >= fecha_desde,
                Gasto.fecha <= fecha_hasta,
            )
            .all()
        )
        gastos_vehiculo = sum(float(g.monto) for g in gastos)

        # Días totales del período
        try:
            from datetime import date as _date
            d_i = _date.fromisoformat(fecha_desde)
            d_f = _date.fromisoformat(fecha_hasta)
            dias_periodo = (d_f - d_i).days + 1
        except ValueError:
            dias_periodo = 30

        ocupacion_pct = round((dias_alquilados / dias_periodo * 100) if dias_periodo > 0 else 0, 1)

        resultado.append({
            "vehiculo_id": v.id,
            "patente": v.patente,
            "marca": v.marca,
            "modelo": v.modelo,
            "tipo": v.tipo,
            "alquileres_count": len(reservas),
            "dias_alquilados": dias_alquilados,
            "ocupacion_porcentaje": min(ocupacion_pct, 100.0),
            "ingresos": ingresos_vehiculo,
            "gastos": gastos_vehiculo,
            "margen": ingresos_vehiculo - gastos_vehiculo,
        })

    resultado.sort(key=lambda x: x["ocupacion_porcentaje"], reverse=True)
    return ok(resultado)
