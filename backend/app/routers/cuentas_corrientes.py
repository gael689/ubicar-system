from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.domain.cuenta_corriente import aplicar_movimiento, calcular_vencimiento
from app.models.usuario import Usuario
from app.models.cliente import Cliente
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente

router = APIRouter(prefix="/cuentas-corrientes", tags=["Cuentas Corrientes"])


class MovimientoCreate(BaseModel):
    tipo: str  # "debito" | "credito"
    concepto: str
    monto: float
    fecha: date
    condicion: str | None = None  # contado | cta_cte_15 | cta_cte_30 | cta_cte_60 | cta_cte_90
    fecha_vencimiento: date | None = None  # si no se indica, se calcula desde `condicion`
    alquiler_id: int | None = None
    reserva_id: int | None = None
    pago_id: int | None = None
    echeq_id: int | None = None
    multa_id: int | None = None


class MovimientoResponse(BaseModel):
    id: int
    tipo: str
    concepto: str
    monto: float
    fecha: date
    condicion: str | None
    fecha_vencimiento: date | None
    saldo_posterior: float
    alquiler_id: int | None
    reserva_id: int | None
    pago_id: int | None
    echeq_id: int | None
    multa_id: int | None
    anulado: bool
    anulado_por_movimiento_id: int | None
    creado_por: int | None
    created_at: datetime
    model_config = {"from_attributes": True}


class AnularRequest(BaseModel):
    motivo: str


class CCResponse(BaseModel):
    id: int
    cliente_id: int
    saldo: float
    condicion_pago: str | None = None
    limite_credito: float | None = None
    bloqueada: bool = False
    observaciones: str | None = None
    cliente_nombre: str | None = None
    model_config = {"from_attributes": True}


def _cc_response(cc: CuentaCorriente, db: Session) -> dict:
    cliente = db.get(Cliente, cc.cliente_id)
    return {
        "id": cc.id,
        "cliente_id": cc.cliente_id,
        "saldo": float(cc.saldo),
        "condicion_pago": cc.condicion_pago,
        "limite_credito": float(cc.limite_credito) if cc.limite_credito is not None else None,
        "bloqueada": cc.bloqueada,
        "observaciones": cc.observaciones,
        "cliente_nombre": cliente.nombre_completo if cliente else None,
    }


@router.get("")
def list_cuentas(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    ccs = db.query(CuentaCorriente).all()
    return ok([_cc_response(cc, db) for cc in ccs])


@router.get("/cliente/{cliente_id}")
def get_or_create_cuenta(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    cc = db.query(CuentaCorriente).filter(CuentaCorriente.cliente_id == cliente_id).first()
    if not cc:
        cc = CuentaCorriente(cliente_id=cliente_id, saldo=0)
        db.add(cc)
        db.commit()
        db.refresh(cc)

    return ok(_cc_response(cc, db))


@router.get("/{cc_id}/movimientos")
def list_movimientos(
    cc_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    cc = db.get(CuentaCorriente, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cuenta corriente no encontrada")

    movs = (
        db.query(MovimientoCuentaCorriente)
        .filter(MovimientoCuentaCorriente.cuenta_corriente_id == cc_id)
        .order_by(MovimientoCuentaCorriente.fecha.desc(), MovimientoCuentaCorriente.id.desc())
        .all()
    )
    return ok([MovimientoResponse.model_validate(m) for m in movs])


@router.post("/{cc_id}/movimientos", status_code=status.HTTP_201_CREATED)
def add_movimiento(
    cc_id: int,
    payload: MovimientoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    cc = db.get(CuentaCorriente, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cuenta corriente no encontrada")
    if payload.tipo not in ("debito", "credito"):
        raise HTTPException(status_code=422, detail="tipo debe ser 'debito' o 'credito'")

    nuevo_saldo = aplicar_movimiento(Decimal(str(cc.saldo)), payload.tipo, Decimal(str(payload.monto)))
    condicion = payload.condicion or cc.condicion_pago
    vencimiento = payload.fecha_vencimiento or calcular_vencimiento(payload.fecha, condicion)

    mov = MovimientoCuentaCorriente(
        cuenta_corriente_id=cc_id,
        tipo=payload.tipo,
        concepto=payload.concepto,
        monto=payload.monto,
        fecha=payload.fecha,
        condicion=condicion,
        fecha_vencimiento=vencimiento,
        saldo_posterior=nuevo_saldo,
        alquiler_id=payload.alquiler_id,
        reserva_id=payload.reserva_id,
        pago_id=payload.pago_id,
        echeq_id=payload.echeq_id,
        multa_id=payload.multa_id,
        creado_por=current_user.id,
    )
    db.add(mov)
    cc.saldo = nuevo_saldo

    db.commit()
    db.refresh(mov)
    return ok(MovimientoResponse.model_validate(mov), "Movimiento registrado")


@router.post("/movimientos/{movimiento_id}/anular")
def anular_movimiento(
    movimiento_id: int,
    payload: AnularRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Anula un movimiento con un contra-asiento (tipo opuesto, mismo monto).
    El movimiento original NUNCA se edita ni se borra — queda marcado
    `anulado=True` y enlazado al contra-asiento que lo revirtió.
    """
    original = db.get(MovimientoCuentaCorriente, movimiento_id)
    if not original:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    if original.anulado:
        raise HTTPException(status_code=409, detail="El movimiento ya está anulado")

    cc = db.get(CuentaCorriente, original.cuenta_corriente_id)
    tipo_contrario = "credito" if original.tipo == "debito" else "debito"
    nuevo_saldo = aplicar_movimiento(Decimal(str(cc.saldo)), tipo_contrario, Decimal(str(original.monto)))

    contra = MovimientoCuentaCorriente(
        cuenta_corriente_id=cc.id,
        tipo=tipo_contrario,
        concepto=f"Anulación de movimiento #{original.id} ({original.concepto}) — {payload.motivo}",
        monto=original.monto,
        fecha=date.today(),
        saldo_posterior=nuevo_saldo,
        alquiler_id=original.alquiler_id,
        reserva_id=original.reserva_id,
        pago_id=original.pago_id,
        echeq_id=original.echeq_id,
        multa_id=original.multa_id,
        creado_por=current_user.id,
    )
    db.add(contra)
    db.flush()

    original.anulado = True
    original.anulado_por_movimiento_id = contra.id
    cc.saldo = nuevo_saldo

    db.commit()
    db.refresh(contra)
    return ok(MovimientoResponse.model_validate(contra), "Movimiento anulado")
