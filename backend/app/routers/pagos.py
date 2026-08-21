from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.models.pago import Pago
from app.models.alquiler import Alquiler
from app.models.reserva import Reserva
from app.models.cliente import Cliente
from app.models.vehiculo import Vehiculo
from app.models.gasto import Gasto
from app.schemas.pago import PagoCreate, PagoResponse, PagoDetalladoResponse, PagoPendienteResponse
from app.schemas.gasto import GastoResponse
from app.schemas.recibo import ReciboDePagoRequest, ReciboResponse
from app.services.recibo_service import ReciboService
from app.services import auditoria_service
from app.services import cobranza_service as cobranza
from app.services.caja_service import CajaService, MEDIOS_QUE_NO_SON_PLATA
from app.models.movimiento_caja import MovimientoCaja
from app.models.recibo import Recibo

router = APIRouter(prefix="/pagos", tags=["Pagos"])


def _enriquecer(pago: Pago, db: Session) -> PagoDetalladoResponse:
    cliente_nombre = None
    vehiculo_patente = None
    reserva_id = None

    alquiler = db.get(Alquiler, pago.alquiler_id) if pago.alquiler_id else None
    if alquiler:
        reserva_id = alquiler.reserva_id
        reserva = db.get(Reserva, alquiler.reserva_id)
        if reserva:
            cliente = db.get(Cliente, reserva.cliente_id)
            if cliente:
                cliente_nombre = cliente.nombre_completo
            # `vehiculo_id` es nullable desde la 042 (reserva por categoría).
            if reserva.vehiculo_id:
                vehiculo = db.get(Vehiculo, reserva.vehiculo_id)
                if vehiculo:
                    vehiculo_patente = vehiculo.patente

    # Un pago a cuenta no tiene alquiler, pero sí cliente.
    if cliente_nombre is None and pago.cliente_id:
        cliente = db.get(Cliente, pago.cliente_id)
        if cliente:
            cliente_nombre = cliente.nombre_completo

    recibo = (
        db.query(Recibo)
        .filter(Recibo.pago_id == pago.id, Recibo.estado == "emitido")
        .first()
    )

    d = PagoDetalladoResponse.model_validate(pago)
    d.cliente_nombre = cliente_nombre
    d.vehiculo_patente = vehiculo_patente
    d.reserva_id = reserva_id
    if recibo:
        d.recibo_id = recibo.id
        d.recibo_numero = f"{recibo.prefijo}-{recibo.numero:08d}"
    return d


# `mercado_pago` entra acá para que el desglose de la caja del día lo muestre
# como una línea propia: lo cobrado online se concilia contra el extracto de
# Mercado Pago, no contra el arqueo del mostrador.
MEDIOS_PAGO = ["efectivo", "transferencia", "tarjeta", "cheque", "echeq",
               "cuenta_corriente", "mercado_pago"]


def _filtrar_pagos(
    db: Session,
    alquiler_id: int | None,
    cliente_id: int | None,
    medio_pago: str | None,
    con_factura: bool | None,
    cobrado_por: int | None,
    fecha_desde: date | None,
    fecha_hasta: date | None,
    monto_min: float | None,
    monto_max: float | None,
):
    """
    Los filtros de cobros, en un solo lugar.

    Existe aparte porque el listado y el resumen de caja tienen que filtrar
    **exactamente igual**: si divergen, el total de abajo no coincide con las
    filas de arriba y el listado deja de servir para cerrar la caja.
    """
    # Los cobros dados de baja no cuentan en ningún total (migración 083).
    q = db.query(Pago).filter(Pago.anulado == False)
    if alquiler_id:
        q = q.filter(Pago.alquiler_id == alquiler_id)
    if cliente_id:
        # Un pago puede colgar del cliente (a cuenta) o del alquiler. Buscar por
        # cliente tiene que encontrar los dos, si no los pagos a cuenta
        # desaparecen del historial del cliente.
        alqs = [
            a.id for a in db.query(Alquiler.id, Alquiler.reserva_id)
            .join(Reserva, Reserva.id == Alquiler.reserva_id)
            .filter(Reserva.cliente_id == cliente_id).all()
        ]
        cond = Pago.cliente_id == cliente_id
        if alqs:
            cond = cond | Pago.alquiler_id.in_(alqs)
        q = q.filter(cond)
    if medio_pago:
        # Coma-separado: la caja se cierra mirando "efectivo + transferencia"
        # junto, no de a un medio por vez.
        medios = [m.strip() for m in medio_pago.split(",") if m.strip()]
        invalidos = [m for m in medios if m not in MEDIOS_PAGO]
        if invalidos:
            raise HTTPException(400, f"Medio de pago inválido: {', '.join(invalidos)}")
        q = q.filter(Pago.medio_pago.in_(medios))
    if con_factura is not None:
        q = q.filter(Pago.con_factura == con_factura)
    if cobrado_por:
        q = q.filter(Pago.cobrado_por == cobrado_por)
    if fecha_desde:
        q = q.filter(Pago.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Pago.fecha <= fecha_hasta)
    if monto_min is not None:
        q = q.filter(Pago.monto >= monto_min)
    if monto_max is not None:
        q = q.filter(Pago.monto <= monto_max)
    return q


@router.get("")
def list_pagos(
    alquiler_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    medio_pago: str | None = Query(None, description="Uno o varios separados por coma"),
    con_factura: bool | None = Query(None),
    cobrado_por: int | None = Query(None, description="Usuario que registró el cobro"),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: float | None = Query(None, ge=0),
    monto_max: float | None = Query(None, ge=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Listado de cobros con el filtrado que necesita la caja.

    Devuelve además `resumen`: el total y el desglose **por medio de pago** de
    todo lo filtrado, no sólo de la página. Cerrar la caja es exactamente eso
    —cuánto entró en efectivo, cuánto por transferencia— y sumar a mano las
    filas de una tabla paginada es donde aparecen las diferencias.
    """
    q = _filtrar_pagos(db, alquiler_id, cliente_id, medio_pago, con_factura,
                       cobrado_por, fecha_desde, fecha_hasta, monto_min, monto_max)

    total = q.count()
    pagos = (
        q.order_by(Pago.fecha.desc(), Pago.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # El desglose se calcula en la base sobre el filtro completo, no sobre la
    # página: si no, el total de caja cambiaría al pasar de página.
    desglose = dict(
        q.with_entities(Pago.medio_pago, func.coalesce(func.sum(Pago.monto), 0))
        .group_by(Pago.medio_pago)
        .all()
    )

    resp = paginated(
        data=[_enriquecer(p, db) for p in pagos],
        total=total,
        page=page,
        page_size=page_size,
    )
    resp["resumen"] = {
        "total": float(sum(desglose.values())),
        "cantidad": total,
        "por_medio": {m: float(desglose.get(m, 0)) for m in MEDIOS_PAGO},
    }
    return resp


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

        # Lo facturado y lo cobrado los calcula `cobranza_service`, que es el
        # único lugar donde vive esta fórmula. Antes estaba copiada acá y en
        # `notificaciones_reglas.saldo_pendiente_al_finalizar`, las dos veces
        # sumando `a.pagos` — que **no incluye el cobro online**: ese `Pago`
        # nace con `alquiler_id=None` porque el alquiler todavía no existe. El
        # alquiler pagado por la web figuraba pidiendo la seña que ya había
        # cobrado. Ver `PLAN_DINERO.md` §1.5.a.
        monto_total = float(cobranza.monto_facturado(a))
        monto_abonado = float(cobranza.monto_cobrado(db, a))
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
    pagos = (
        db.query(Pago)
        .filter(Pago.fecha == fecha, Pago.anulado == False)
        .order_by(Pago.id.desc())
        .all()
    )
    gastos = (
        db.query(Gasto)
        .filter(Gasto.fecha == fecha, Gasto.anulado == False)
        .order_by(Gasto.id.desc())
        .all()
    )

    caja = CajaService(db)
    movimientos = caja.del_dia(fecha)

    # **El total de ingresos ya no suma los cobros con medio cuenta_corriente.**
    # Ese medio significa "se lo anotamos en la cuenta", o sea que la plata no
    # entro: sumarlo inflaba el total del dia sin que nadie lo notara
    # (PLAN_DINERO.md 4.4). El desglose por medio si los sigue mostrando --son
    # cobros reales, solo que no son plata-- con su propia linea.
    total_ingresos = sum(
        float(p.monto) for p in pagos if p.medio_pago not in MEDIOS_QUE_NO_SON_PLATA
    )
    total_a_cuenta = sum(
        float(p.monto) for p in pagos if p.medio_pago in MEDIOS_QUE_NO_SON_PLATA
    )
    total_egresos = sum(float(g.monto) for g in gastos)

    por_medio: dict[str, float] = {}
    for p in pagos:
        por_medio[p.medio_pago] = por_medio.get(p.medio_pago, 0.0) + float(p.monto)

    cobros_detalle = [_enriquecer(p, db) for p in pagos]
    gastos_resp = [GastoResponse.model_validate(g) for g in gastos]

    return ok({
        "fecha": fecha,
        "total_ingresos": total_ingresos,
        # Lo que se anoto en cuenta corriente ese dia. Se muestra aparte para
        # que no parezca que desaparecio del total.
        "total_a_cuenta": total_a_cuenta,
        "total_egresos": total_egresos,
        "balance": total_ingresos - total_egresos,
        "por_medio_pago": por_medio,
        "cobros": cobros_detalle,
        "gastos": gastos_resp,
        "movimientos_caja": [_movimiento_caja_response(m) for m in movimientos],
        # Donde esta la plata. Ver CajaService.donde_esta_la_plata.
        "donde_esta_la_plata": _serializar_plata(caja.donde_esta_la_plata(fecha)),
    })


def _movimiento_caja_response(m: MovimientoCaja) -> dict:
    return {
        "id": m.id,
        "fecha": m.fecha,
        "tipo": m.tipo,
        "monto": float(m.monto),
        "medio": m.medio,
        "motivo": m.motivo,
        "cliente_id": m.cliente_id,
        "reserva_id": m.reserva_id,
        "alquiler_id": m.alquiler_id,
        "efecto_en_caja": float(m.efecto_en_caja),
        "anulado": m.anulado,
        "creado_por": m.creado_por,
    }


def _serializar_plata(d: dict) -> dict:
    return {
        "efectivo_sin_depositar": float(d["efectivo_sin_depositar"]),
        "ultimo_deposito_fecha": d["ultimo_deposito_fecha"],
        "ultimo_deposito_monto": (
            float(d["ultimo_deposito_monto"]) if d["ultimo_deposito_monto"] is not None else None
        ),
        "sin_depositos_cargados": d["sin_depositos_cargados"],
    }


# --- Movimientos de caja ------------------------------------------------------

class MovimientoCajaCreate(BaseModel):
    """
    Plata que se mueve sin ser de nadie: un deposito al banco, un retiro, una
    garantia en efectivo que entra o vuelve, un reembolso.

    El **motivo es obligatorio** y no es burocracia: ningun evento del sistema
    dispara estos movimientos, asi que si no lo escribe quien lo carga, no lo
    escribe nadie.
    """
    tipo: Literal["deposito_banco", "retiro", "garantia_recibida",
                  "garantia_devuelta", "reembolso"]
    monto: Decimal
    medio: str = "efectivo"
    motivo: str
    fecha: date
    cliente_id: int | None = None
    reserva_id: int | None = None
    alquiler_id: int | None = None

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El movimiento de caja necesita un motivo")
        return v.strip()

    @field_validator("monto")
    @classmethod
    def _monto_positivo(cls, v: Decimal) -> Decimal:
        # Siempre positivo: el signo lo define el tipo. Ver SIGNO_EN_CAJA.
        if v is None or v <= 0:
            raise ValueError("El monto tiene que ser mayor a cero")
        return v


class AnularMovimientoCajaRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Anular un movimiento de caja requiere un motivo")
        return v.strip()


@router.get("/caja/movimientos")
def list_movimientos_caja(
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    tipo: str | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(MovimientoCaja).filter(MovimientoCaja.anulado == False)
    if fecha_desde:
        q = q.filter(MovimientoCaja.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(MovimientoCaja.fecha <= fecha_hasta)
    if tipo:
        q = q.filter(MovimientoCaja.tipo == tipo)
    movs = q.order_by(MovimientoCaja.fecha.desc(), MovimientoCaja.id.desc()).all()
    return ok([_movimiento_caja_response(m) for m in movs])


@router.post("/caja/movimientos", status_code=status.HTTP_201_CREATED)
def create_movimiento_caja(
    payload: MovimientoCajaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Registra un movimiento de caja.

    **El reembolso no entra por aca.** Devolverle plata a un cliente tambien
    tiene que revertir el credito en su cuenta corriente, y hacer solo una de
    las dos cosas deja el libro contradiciendo a la caja. Ese camino es
    POST /pagos/reembolsos.
    """
    if payload.tipo == "reembolso":
        raise HTTPException(
            status_code=422,
            detail=(
                "Un reembolso se registra desde el reintegro al cliente, no como "
                "movimiento de caja suelto: tiene que revertir tambien su cuenta "
                "corriente."
            ),
        )
    try:
        mov = CajaService(db).registrar(
            tipo=payload.tipo,
            monto=payload.monto,
            medio=payload.medio,
            motivo=payload.motivo,
            fecha=payload.fecha,
            creado_por=current_user.id,
            cliente_id=payload.cliente_id,
            reserva_id=payload.reserva_id,
            alquiler_id=payload.alquiler_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    db.refresh(mov)
    return ok(_movimiento_caja_response(mov), "Movimiento de caja registrado")


@router.post("/caja/movimientos/{movimiento_id}/anular")
def anular_movimiento_caja(
    movimiento_id: int,
    payload: AnularMovimientoCajaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Baja logica con motivo. Nunca un DELETE: la plata de un dia pasado no
    puede desaparecer sin rastro."""
    try:
        mov = CajaService(db).anular(movimiento_id, payload.motivo, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    db.refresh(mov)
    return ok(_movimiento_caja_response(mov), "Movimiento de caja anulado")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_pago(
    payload: PagoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    # Desde la migración 043 un pago puede no tener alquiler (pago a cuenta,
    # seña de una reserva sin alquiler todavía, cancelación de deuda vieja).
    # Lo que no puede faltar es el cliente: siempre se le cobra a alguien.
    cliente_id = payload.cliente_id
    alquiler = None
    if payload.alquiler_id is not None:
        alquiler = db.query(Alquiler).filter(Alquiler.id == payload.alquiler_id).first()
        if not alquiler:
            raise HTTPException(status_code=404, detail="Alquiler no encontrado")
        reserva = db.get(Reserva, alquiler.reserva_id)
        if reserva:
            cliente_id = cliente_id or reserva.cliente_id

    if cliente_id is None:
        raise HTTPException(
            status_code=422,
            detail="El pago necesita un cliente, o un alquiler del que deducirlo",
        )

    pago = Pago(
        **payload.model_dump(exclude={"cliente_id"}),
        cliente_id=cliente_id,
        cobrado_por=current_user.id,
    )
    db.add(pago)
    db.flush()  # asegurar pago.id antes de enlazarlo al movimiento

    # Ledger completo: todo alquiler factura un débito automático en el
    # checkout (ver AlquilerService.checkout). Cualquier cobro posterior,
    # sea cual sea el medio de pago, genera el CRÉDITO que lo cancela.
    from decimal import Decimal
    from app.services.cuenta_corriente_service import CuentaCorrienteService

    concepto = (
        f"Cobro alquiler #{payload.alquiler_id} ({payload.medio_pago})"
        if payload.alquiler_id is not None
        else f"Cobro a cuenta ({payload.medio_pago})"
    )
    CuentaCorrienteService(db).registrar_movimiento(
        cliente_id=cliente_id,
        tipo="credito",
        # Un cobro suelto siempre es contra una deuda que ya existe: es un
        # `pago`, no un `anticipo`. La seña de una reserva sin alquiler entra
        # por `ReservaService.registrar_cobro`, que sí la asienta como anticipo.
        naturaleza="pago",
        concepto=concepto,
        monto=Decimal(str(payload.monto)),
        fecha=payload.fecha,
        creado_por=current_user.id,
        alquiler_id=payload.alquiler_id,
        pago_id=pago.id,
    )

    db.commit()
    db.refresh(pago)
    return ok(_enriquecer(pago, db), "Pago registrado")


@router.post("/{pago_id}/recibo", status_code=status.HTTP_201_CREATED)
def emitir_recibo_de_pago(
    pago_id: int,
    payload: ReciboDePagoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    El papel de un cobro que ya se registró.

    **No mueve plata**: el crédito lo generó el pago cuando se creó. Por eso un
    pago puede tener su recibo sin que el saldo cambie — que es exactamente lo
    que antes no se podía hacer y llevaba a acreditar dos veces.
    """
    pago = db.query(Pago).filter(Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    recibo = ReciboService(db).emitir_para_pago(
        pago, payload.concepto or _concepto_de(pago, db), usuario_id=current_user.id
    )
    db.commit()
    db.refresh(recibo)
    return ok(ReciboResponse.model_validate(recibo), "Recibo emitido")


def _concepto_de(pago: Pago, db: Session) -> str:
    """
    El concepto que alguien escribiría a mano, armado solo.

    Existe para que emitir el recibo sea un click desde el listado: obligar a
    tipear "Alquiler #14" cada vez es lo que hace que el recibo no se emita.
    """
    if not pago.alquiler_id:
        return "Pago a cuenta"

    alquiler = db.get(Alquiler, pago.alquiler_id)
    reserva = db.get(Reserva, alquiler.reserva_id) if alquiler else None
    vehiculo = (
        db.get(Vehiculo, reserva.vehiculo_id) if reserva and reserva.vehiculo_id else None
    )
    if vehiculo:
        return f"Alquiler #{pago.alquiler_id} — {vehiculo.marca} {vehiculo.modelo} ({vehiculo.patente})"
    return f"Alquiler #{pago.alquiler_id}"


class AnularPagoRequest(BaseModel):
    """
    Dar de baja un cobro. **El motivo es obligatorio y no es burocracia**: es lo
    único que va a quedar para explicar por qué la caja de un día pasado cambió.
    """
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Anular un cobro requiere un motivo")
        return v.strip()


@router.post("/{pago_id}/anular")
def anular_pago(
    pago_id: int,
    payload: AnularPagoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Da de baja un cobro. **No lo borra.**

    Hasta la Fase 7 esto era `DELETE /pagos/{id}` con un `db.delete(pago)`
    adentro: el único borrado físico del sistema, y el que contradecía de frente
    la regla que gobierna todo el circuito — *el ledger nunca se edita, se
    compensa*. El comentario del código lo admitía: después del delete no
    quedaba ninguna fila que pudiera contar qué había ni quién la sacó. Sacaba
    plata de la caja de cualquier fecha pasada, y el cobro desaparecía del
    historial del cliente como si nunca hubiera existido.

    El dueño lo cerró: **nadie debe usar el borrado físico**. Ahora el cobro
    queda, marcado `anulado` con motivo, autor y fecha, y su crédito en la
    cuenta corriente se revierte con un contra-asiento — nunca editando el
    original.

    Sigue frenando si hay un recibo emitido: el papel manda, y no se puede
    anular por atrás un cobro del que el cliente tiene comprobante.
    """
    pago = db.query(Pago).filter(Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if pago.anulado:
        raise HTTPException(status_code=409, detail="El cobro ya está anulado")

    # Si ya se le entregó un recibo al cliente, el papel manda: no se puede
    # anular el cobro por atrás y dejar circulando un comprobante que dice que
    # existió. Primero se anula el recibo, que es un acto explícito y con
    # motivo.
    recibo = (
        db.query(Recibo)
        .filter(Recibo.pago_id == pago_id, Recibo.estado == "emitido")
        .first()
    )
    if recibo:
        raise HTTPException(
            status_code=409,
            detail=(
                f"El pago tiene el recibo {recibo.prefijo}-{recibo.numero:08d} emitido. "
                "Anulá el recibo antes de dar de baja el cobro."
            ),
        )

    # Todo pago generó un crédito en la cuenta corriente del cliente. Se revierte
    # con un contra-asiento; el original nunca se toca.
    from app.services.cuenta_corriente_service import CuentaCorrienteService

    CuentaCorrienteService(db).anular_por_pago(
        pago_id, motivo=payload.motivo, creado_por=current_user.id
    )

    pago.anulado = True
    pago.motivo_anulacion = payload.motivo
    pago.anulado_por = current_user.id
    pago.anulado_en = datetime.utcnow()

    auditoria_service.registrar(
        db,
        usuario_id=current_user.id,
        accion="anular",
        entidad_tipo="pago",
        entidad_id=pago.id,
        descripcion=(
            f"Dio de baja el cobro #{pago.id} de ${pago.monto} "
            f"({pago.medio_pago}, {pago.fecha}). Motivo: {payload.motivo}"
        ),
        datos_antes={
            "monto": pago.monto,
            "medio_pago": pago.medio_pago,
            "fecha": pago.fecha,
            "cliente_id": pago.cliente_id,
            "alquiler_id": pago.alquiler_id,
        },
        datos_despues={"anulado": True, "motivo": payload.motivo},
        monto=pago.monto,
    )

    db.commit()
    db.refresh(pago)
    return ok(_enriquecer(pago, db), "Cobro dado de baja")


@router.delete("/{pago_id}", status_code=status.HTTP_410_GONE)
def delete_pago(pago_id: int):
    """
    **Ya no existe.** El borrado físico de un cobro se eliminó en la Fase 7 del
    `PLAN_DINERO.md`: sacaba plata de la caja de cualquier fecha pasada sin
    dejar nada que contara qué había.

    Se devuelve 410 y no 404 a propósito: 404 diría "ese pago no existe" y lo
    que pasa es otra cosa — el pago existe, la operación no. Cualquier pantalla
    que todavía llame acá tiene que pasar a `POST /pagos/{id}/anular`, que pide
    el motivo.
    """
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Un cobro no se borra: se da de baja con motivo. "
            "Usá POST /pagos/{id}/anular."
        ),
    )
