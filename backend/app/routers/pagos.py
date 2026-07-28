from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.pago import Pago
from app.models.alquiler import Alquiler
from app.models.reserva import Reserva
from app.models.cliente import Cliente
from app.models.vehiculo import Vehiculo
from app.models.gasto import Gasto
from app.schemas.pago import PagoCreate, PagoResponse, PagoDetalladoResponse, PagoPendienteResponse
from app.schemas.gasto import GastoResponse

router = APIRouter(prefix="/pagos", tags=["Pagos"])


def _enriquecer(pago: Pago, db: Session) -> PagoDetalladoResponse:
    alquiler = db.get(Alquiler, pago.alquiler_id)
    cliente_nombre = None
    vehiculo_patente = None
    reserva_id = None
    if alquiler:
        reserva_id = alquiler.reserva_id
        reserva = db.get(Reserva, alquiler.reserva_id)
        if reserva:
            cliente = db.get(Cliente, reserva.cliente_id)
            if cliente:
                cliente_nombre = cliente.nombre_completo
            vehiculo = db.get(Vehiculo, reserva.vehiculo_id)
            if vehiculo:
                vehiculo_patente = vehiculo.patente
    d = PagoDetalladoResponse.model_validate(pago)
    d.cliente_nombre = cliente_nombre
    d.vehiculo_patente = vehiculo_patente
    d.reserva_id = reserva_id
    return d


@router.get("")
def list_pagos(
    alquiler_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Pago)
    if alquiler_id:
        q = q.filter(Pago.alquiler_id == alquiler_id)
    if fecha_desde:
        q = q.filter(Pago.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Pago.fecha <= fecha_hasta)
    pagos = q.order_by(Pago.fecha.desc(), Pago.id.desc()).all()
    return ok([_enriquecer(p, db) for p in pagos])


@router.get("/pendientes")
def get_pagos_pendientes(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    pendientes = []
    
    # 1. Alquileres con saldo deudor
    alquileres = db.query(Alquiler).all()
    for a in alquileres:
        reserva = a.reserva
        if not reserva:
            continue
        
        monto_total = (
            float(reserva.precio_total or 0)
            + float(reserva.cargo_late_checkout or 0)
            + float(a.cargo_excedente or 0)
            + float(reserva.total_adicionales)
        )
        # El anticipo ya se registra como Pago al hacer el checkout: no sumarlo aparte.
        monto_abonado = sum(float(p.monto) for p in a.pagos)
        saldo_pendiente = monto_total - monto_abonado
        
        if saldo_pendiente > 0:
            cliente = reserva.cliente.nombre_completo if reserva.cliente else "Desconocido"
            pendientes.append({
                "tipo": "alquiler_checkout",
                "id_origen": a.id,
                "cliente": cliente,
                "monto_total": monto_total,
                "monto_abonado": monto_abonado,
                "saldo_pendiente": saldo_pendiente,
                "fecha_creacion": a.checkout_fecha.isoformat(),
                "notas": f"Reserva #{reserva.id} - Saldo de alquiler"
            })
            
    # 2. Reservas sin Alquiler (estado pendiente o confirmada) con saldo
    reservas = db.query(Reserva).filter(Reserva.estado.in_(["pendiente", "confirmada"])).all()
    for r in reservas:
        # Check if Alquiler exists for this Reserva
        alquiler = db.query(Alquiler).filter(Alquiler.reserva_id == r.id).first()
        if alquiler:
            continue
            
        monto_total = (
            float(r.precio_total or 0)
            + float(r.cargo_late_checkout or 0)
            + float(r.total_adicionales)
        )
        monto_abonado = float(r.anticipo_monto or 0)
        saldo_pendiente = monto_total - monto_abonado
        
        if saldo_pendiente > 0:
            cliente = r.cliente.nombre_completo if r.cliente else "Desconocido"
            pendientes.append({
                "tipo": "reserva",
                "id_origen": r.id,
                "cliente": cliente,
                "monto_total": monto_total,
                "monto_abonado": monto_abonado,
                "saldo_pendiente": saldo_pendiente,
                "fecha_creacion": r.created_at.isoformat() if r.created_at else "",
                "notas": r.notas
            })
            
    return ok(pendientes)


@router.get("/caja/dia")
def caja_dia(
    fecha: date = Query(..., description="ISO YYYY-MM-DD"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    pagos = db.query(Pago).filter(Pago.fecha == fecha).order_by(Pago.id.desc()).all()
    gastos = db.query(Gasto).filter(Gasto.fecha == fecha).order_by(Gasto.id.desc()).all()

    total_ingresos = sum(float(p.monto) for p in pagos)
    total_egresos = sum(float(g.monto) for g in gastos)

    por_medio: dict[str, float] = {}
    for p in pagos:
        por_medio[p.medio_pago] = por_medio.get(p.medio_pago, 0.0) + float(p.monto)

    cobros_detalle = [_enriquecer(p, db) for p in pagos]
    gastos_resp = [GastoResponse.model_validate(g) for g in gastos]

    return ok({
        "fecha": fecha,
        "total_ingresos": total_ingresos,
        "total_egresos": total_egresos,
        "balance": total_ingresos - total_egresos,
        "por_medio_pago": por_medio,
        "cobros": cobros_detalle,
        "gastos": gastos_resp,
    })


@router.post("", status_code=status.HTTP_201_CREATED)
def create_pago(
    payload: PagoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    alquiler = db.query(Alquiler).filter(Alquiler.id == payload.alquiler_id).first()
    if not alquiler:
        raise HTTPException(status_code=404, detail="Alquiler no encontrado")

    pago = Pago(**payload.model_dump(), cobrado_por=current_user.id)
    db.add(pago)
    db.flush()  # asegurar pago.id antes de enlazarlo al movimiento

    # Ledger completo: todo alquiler factura un débito automático en el
    # checkout (ver AlquilerService.checkout). Cualquier cobro posterior,
    # sea cual sea el medio de pago, genera el CRÉDITO que lo cancela.
    reserva = db.get(Reserva, alquiler.reserva_id)
    if reserva:
        from decimal import Decimal
        from app.services.cuenta_corriente_service import CuentaCorrienteService

        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=reserva.cliente_id,
            tipo="credito",
            concepto=f"Cobro alquiler #{payload.alquiler_id} ({payload.medio_pago})",
            monto=Decimal(str(payload.monto)),
            fecha=payload.fecha,
            creado_por=current_user.id,
            alquiler_id=payload.alquiler_id,
            pago_id=pago.id,
        )

    db.commit()
    db.refresh(pago)
    return ok(_enriquecer(pago, db), "Pago registrado")


@router.delete("/{pago_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pago(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    pago = db.query(Pago).filter(Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    # Con el ledger completo, todo pago generó un crédito en la cuenta
    # corriente del cliente (ver create_pago). Antes de borrar el Pago, se
    # anula ese movimiento con un contra-asiento — nunca se edita ni se
    # borra el original — para que el saldo no quede desincronizado.
    from app.services.cuenta_corriente_service import CuentaCorrienteService

    mov = CuentaCorrienteService(db).anular_por_pago(
        pago_id, motivo=f"se eliminó el pago #{pago_id}", creado_por=current_user.id
    )
    if mov:
        # El Pago está por borrarse (hard delete): anular_por_pago ya
        # desvinculó la FK del movimiento original. Forzar que ese UPDATE
        # llegue a la base antes del DELETE del pago, o la FK todavía
        # referenciada rechaza el borrado.
        db.flush()

    db.delete(pago)
    db.commit()
