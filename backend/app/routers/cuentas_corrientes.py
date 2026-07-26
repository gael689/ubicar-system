from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.cliente import Cliente
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente

router = APIRouter(prefix="/cuentas-corrientes", tags=["Cuentas Corrientes"])


class MovimientoCreate(BaseModel):
    tipo: str  # "debito" | "credito"
    concepto: str
    monto: float
    fecha: str
    alquiler_id: int | None = None


class MovimientoResponse(BaseModel):
    id: int
    tipo: str
    concepto: str
    monto: float
    fecha: str
    alquiler_id: int | None
    model_config = {"from_attributes": True}


class CCResponse(BaseModel):
    id: int
    cliente_id: int
    saldo: float
    cliente_nombre: str | None = None
    model_config = {"from_attributes": True}


def _cc_response(cc: CuentaCorriente, db: Session) -> dict:
    cliente = db.get(Cliente, cc.cliente_id)
    return {
        "id": cc.id,
        "cliente_id": cc.cliente_id,
        "saldo": float(cc.saldo),
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
    _: Usuario = Depends(get_current_user),
):
    cc = db.get(CuentaCorriente, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cuenta corriente no encontrada")

    mov = MovimientoCuentaCorriente(
        cuenta_corriente_id=cc_id,
        **payload.model_dump(),
    )
    db.add(mov)

    if payload.tipo == "credito":
        cc.saldo = float(cc.saldo) + payload.monto
    else:
        cc.saldo = float(cc.saldo) - payload.monto

    db.commit()
    db.refresh(mov)
    return ok(MovimientoResponse.model_validate(mov), "Movimiento registrado")
