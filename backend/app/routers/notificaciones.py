"""
Endpoint de notificaciones in-system.
No hay tabla de notificaciones — todo se computa on-demand desde las tablas existentes.
"""
from datetime import date, timedelta, datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.responses import ok
from app.models.alquiler import Alquiler
from app.models.documento import Documento
from app.models.multa import Multa
from app.models.reserva import Reserva
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo

router = APIRouter(tags=["Notificaciones"])

TipoNotif = Literal[
    "checkout_pendiente",
    "checkin_pendiente",
    "garantia_sin_resolver",
    "doc_vehiculo_vencido",
    "doc_vehiculo_por_vencer",
    "doc_cliente_vencido",
    "doc_cliente_por_vencer",
    "service_vencido",
    "service_proximo",
    "multa_pendiente",
    "pago_pendiente",
]


class NotificacionItem(BaseModel):
    tipo: str
    titulo: str
    descripcion: str
    urgencia: Literal["alta", "media", "baja"]
    entidad_tipo: str
    entidad_id: int
    url_destino: str


class NotificacionesResponse(BaseModel):
    items: list[NotificacionItem]
    total: int
    urgentes: int


@router.get("/notificaciones", response_model=None)
def get_notificaciones(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    hoy = date.today()
    en_30_dias = hoy + timedelta(days=30)
    items: list[NotificacionItem] = []

    # ── 1. Checkouts pendientes (reservas confirmadas cuya fecha/hora programada ya pasó) ──
    ahora = datetime.now()
    hoy_date = ahora.date()
    ahora_time = ahora.time()

    reservas_sin_checkout = (
        db.query(Reserva)
        .outerjoin(Alquiler, Alquiler.reserva_id == Reserva.id)
        .filter(
            Reserva.estado == "confirmada",
            (Reserva.fecha_inicio < hoy_date) | 
            (and_(Reserva.fecha_inicio == hoy_date, Reserva.hora_inicio <= ahora_time)),
            Alquiler.id == None,
        )
        .all()
    )
    for r in reservas_sin_checkout:
        items.append(NotificacionItem(
            tipo="checkout_pendiente",
            titulo="Checkout pendiente",
            descripcion=f"Reserva #{r.id} — {r.vehiculo.patente if r.vehiculo else '?'} — {r.cliente.nombre_completo if r.cliente else '?'}",
            urgencia="alta",
            entidad_tipo="reserva",
            entidad_id=r.id,
            url_destino="/reservas",
        ))

    # ── 2. Checkins pendientes (reservas vencidas: pasó la hora de devolución y el auto no volvió) ──
    alquileres_vencidos = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Reserva.estado == "vencida")
        .all()
    )
    for a in alquileres_vencidos:
        r = a.reserva
        vencimiento_dt = datetime.combine(r.fecha_fin, r.hora_fin)
        atraso = ahora - vencimiento_dt
        horas_atraso = int(atraso.total_seconds() // 3600)
        items.append(NotificacionItem(
            tipo="checkin_pendiente",
            titulo="Devolución vencida",
            descripcion=(
                f"Alquiler #{a.id} — {r.vehiculo.patente if r.vehiculo else '?'} — "
                f"{r.cliente.nombre_completo if r.cliente else '?'} — "
                f"venció {r.fecha_fin} {r.hora_fin.strftime('%H:%M')} ({horas_atraso}h de atraso)"
            ),
            urgencia="alta",
            entidad_tipo="alquiler",
            entidad_id=a.id,
            url_destino="/reservas",
        ))

    # ── 3. Garantías sin resolver (reserva finalizada con garantía retenida) ──
    garantias_pendientes = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(
            Reserva.estado == "finalizada",
            Alquiler.garantia_tipo != None,
            Alquiler.garantia_tipo != "no_aplica",
            Alquiler.garantia_estado == "retenida",
        )
        .all()
    )
    for a in garantias_pendientes:
        items.append(NotificacionItem(
            tipo="garantia_sin_resolver",
            titulo="Garantía sin resolver",
            descripcion=f"Alquiler #{a.id} — Garantía {a.garantia_tipo} de ${a.garantia_monto} pendiente de devolución",
            urgencia="media",
            entidad_tipo="alquiler",
            entidad_id=a.id,
            url_destino="/reservas",
        ))

    # ── 4. Documentos de vehículos vencidos / por vencer ──
    docs_vehiculo = (
        db.query(Documento)
        .filter(
            Documento.vehiculo_id != None,
            Documento.cliente_id == None,
            Documento.vigencia_hasta != None,
        )
        .all()
    )
    for d in docs_vehiculo:
        vh = d.vigencia_hasta  # date
        if vh < hoy:
            items.append(NotificacionItem(
                tipo="doc_vehiculo_vencido",
                titulo=f"Documento vencido ({d.tipo})",
                descripcion=f"{d.nombre} — Vehículo ID {d.vehiculo_id} — venció {vh}",
                urgencia="alta",
                entidad_tipo="vehiculo",
                entidad_id=d.vehiculo_id,
                url_destino=f"/flota/{d.vehiculo_id}",
            ))
        elif vh <= en_30_dias:
            items.append(NotificacionItem(
                tipo="doc_vehiculo_por_vencer",
                titulo=f"Documento por vencer ({d.tipo})",
                descripcion=f"{d.nombre} — Vehículo ID {d.vehiculo_id} — vence {vh}",
                urgencia="media",
                entidad_tipo="vehiculo",
                entidad_id=d.vehiculo_id,
                url_destino=f"/flota/{d.vehiculo_id}",
            ))

    # ── 5. Documentos de clientes vencidos / por vencer ──
    docs_cliente = (
        db.query(Documento)
        .filter(
            Documento.cliente_id != None,
            Documento.vigencia_hasta != None,
        )
        .all()
    )
    for d in docs_cliente:
        vh = d.vigencia_hasta  # date
        if vh < hoy:
            items.append(NotificacionItem(
                tipo="doc_cliente_vencido",
                titulo=f"Doc. cliente vencido ({d.tipo})",
                descripcion=f"{d.nombre} — Cliente ID {d.cliente_id} — venció {vh}",
                urgencia="alta",
                entidad_tipo="cliente",
                entidad_id=d.cliente_id,
                url_destino=f"/clientes/{d.cliente_id}",
            ))
        elif vh <= en_30_dias:
            items.append(NotificacionItem(
                tipo="doc_cliente_por_vencer",
                titulo=f"Doc. cliente por vencer ({d.tipo})",
                descripcion=f"{d.nombre} — Cliente ID {d.cliente_id} — vence {vh}",
                urgencia="baja",
                entidad_tipo="cliente",
                entidad_id=d.cliente_id,
                url_destino=f"/clientes/{d.cliente_id}",
            ))

    # ── 6. Mantenimiento vehículos ──
    vehiculos = db.query(Vehiculo).filter(Vehiculo.activo == True, Vehiculo.km_proximo_service > 0).all()
    for v in vehiculos:
        restantes = v.km_proximo_service - v.km_actual
        if restantes <= 0:
            items.append(NotificacionItem(
                tipo="service_vencido",
                titulo="Service vencido",
                descripcion=f"{v.patente} {v.marca} {v.modelo} — {abs(restantes)} km pasados del próximo service",
                urgencia="alta",
                entidad_tipo="vehiculo",
                entidad_id=v.id,
                url_destino=f"/flota/{v.id}",
            ))
        elif restantes < 1000:
            items.append(NotificacionItem(
                tipo="service_proximo",
                titulo="Service próximo",
                descripcion=f"{v.patente} {v.marca} {v.modelo} — faltan {restantes} km para el próximo service",
                urgencia="media",
                entidad_tipo="vehiculo",
                entidad_id=v.id,
                url_destino=f"/flota/{v.id}",
            ))

    # ── 7. Multas pendientes ──
    multas = db.query(Multa).filter(Multa.estado == "pendiente", Multa.activo == True).all()
    for m in multas:
        items.append(NotificacionItem(
            tipo="multa_pendiente",
            titulo="Multa pendiente",
            descripcion=f"Multa #{m.id} — ${m.monto} — {m.descripcion[:50] if m.descripcion else ''}",
            urgencia="media",
            entidad_tipo="multa",
            entidad_id=m.id,
            url_destino="/multas",
        ))

    # ── 8. Pagos pendientes ──
    # Para ser eficiente, reutilizamos lógica parecida a /pagos/pendientes, pero solo reservas finalizadas con deuda
    alquileres_finalizados = (
        db.query(Alquiler)
        .join(Reserva, Reserva.id == Alquiler.reserva_id)
        .filter(Reserva.estado == "finalizada")
        .all()
    )
    for a in alquileres_finalizados:
        r = a.reserva
        monto_total = float(r.precio_total or 0) + float(r.cargo_late_checkout or 0) + float(a.cargo_excedente or 0)
        # El anticipo ya se registra como Pago al hacer el checkout (ver AlquilerService.checkout),
        # por lo que no debe sumarse aparte: sumarlo duplicaría el monto abonado.
        monto_abonado = sum(float(p.monto) for p in a.pagos)
        saldo_pendiente = monto_total - monto_abonado

        if saldo_pendiente > 0 and r.fecha_fin < hoy:
            dias_vencido = (hoy - r.fecha_fin).days
            urgencia = "alta" if dias_vencido > 3 else "media"
            
            items.append(NotificacionItem(
                tipo="pago_pendiente",
                titulo="Pago pendiente",
                descripcion=f"Reserva #{r.id} finalizada adeuda ${saldo_pendiente:,.2f} ({dias_vencido} días vencido)",
                urgencia=urgencia,
                entidad_tipo="alquiler",
                entidad_id=a.id,
                url_destino="/caja",
            ))

    urgentes = sum(1 for i in items if i.urgencia == "alta")
    return ok(NotificacionesResponse(items=items, total=len(items), urgentes=urgentes).model_dump())
