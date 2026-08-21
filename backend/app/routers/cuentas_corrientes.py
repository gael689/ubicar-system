from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.cliente import Cliente
from app.models.cuenta_corriente import CuentaCorriente, MovimientoCuentaCorriente
from app.services.cuenta_corriente_service import CuentaCorrienteService

router = APIRouter(prefix="/cuentas-corrientes", tags=["Cuentas Corrientes"])


def _service(db: Session = Depends(get_db)) -> CuentaCorrienteService:
    return CuentaCorrienteService(db)


class MovimientoCreate(BaseModel):
    tipo: str  # "debito" | "credito"
    # `min_length=1` no alcanza: "   " lo pasa. El validator de abajo es el que
    # corta. Ver `PLAN_DINERO.md` §1.5.c.
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

    @field_validator("concepto")
    @classmethod
    def _concepto_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El movimiento necesita un concepto")
        return v.strip()


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
    vencimiento_editado_motivo: str | None = None
    vencimiento_editado_por: int | None = None
    vencimiento_editado_en: datetime | None = None
    model_config = {"from_attributes": True}


class AnularRequest(BaseModel):
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        # Sin roles que restrinjan quién anula un asiento, el motivo es el
        # control. Vacío deja el contra-asiento y la auditoría sin explicación.
        if not v or not v.strip():
            raise ValueError("Anular un movimiento requiere un motivo")
        return v.strip()


class EditarVencimientoRequest(BaseModel):
    fecha_vencimiento: date | None
    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Editar el vencimiento requiere un motivo")
        return v.strip()
    condicion: str | None = None  # opcional: renegociar también la condición


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


def _cc_response(cc: CuentaCorriente, db: Session, svc=None) -> dict:
    cliente = db.get(Cliente, cc.cliente_id)
    # El saldo partido en deuda y anticipos. Ver `CuentaCorrienteService.desglose`:
    # un crédito de una reserva que todavía no salió no es plata que se deba,
    # es un auto que se debe entregar, y mezclarlos hace que la ficha diga
    # "saldo a favor" de un cliente que no tiene nada a favor.
    desglose = None
    if svc is not None:
        try:
            d = svc.desglose(cc.cliente_id)
            desglose = {
                "deuda": float(d["deuda"]),
                "anticipos": float(d["anticipos"]),
            }
        except Exception:
            # El desglose es informativo: que falle no puede dejar sin cuenta
            # corriente a la pantalla que la necesita.
            desglose = None
    return {
        "id": cc.id,
        "cliente_id": cc.cliente_id,
        "saldo": float(cc.saldo),
        # `None` cuando no se pudo calcular: la pantalla cae al saldo de
        # siempre en vez de mostrar un cero que sería mentira.
        "deuda": desglose["deuda"] if desglose else None,
        "anticipos": desglose["anticipos"] if desglose else None,
        "condicion_pago": cc.condicion_pago,
        "limite_credito": float(cc.limite_credito) if cc.limite_credito is not None else None,
        "bloqueada": cc.bloqueada,
        "observaciones": cc.observaciones,
        "cliente_nombre": cliente.nombre_completo if cliente else None,
    }


@router.get("/pendientes")
def list_clientes_con_pago_pendiente(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """IDs de clientes con un débito vencido o que vence en <=3 días —
    para el badge "Pago pendiente" del listado de clientes (seguimiento,
    sin entrar al detalle de cada uno)."""
    limite = date.today() + timedelta(days=3)
    cliente_ids = (
        db.query(CuentaCorriente.cliente_id)
        .join(MovimientoCuentaCorriente, MovimientoCuentaCorriente.cuenta_corriente_id == CuentaCorriente.id)
        .filter(
            MovimientoCuentaCorriente.tipo == "debito",
            MovimientoCuentaCorriente.anulado == False,
            MovimientoCuentaCorriente.fecha_vencimiento.isnot(None),
            MovimientoCuentaCorriente.fecha_vencimiento <= limite,
        )
        .distinct()
        .all()
    )
    return ok(sorted(cid for (cid,) in cliente_ids))


@router.get("")
def list_cuentas(
    q: str | None = Query(
        None,
        description="Busca por nombre, razon social, DNI o CUIT del cliente",
    ),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Las cuentas corrientes, con su saldo.

    **`q` busca por el cliente, no por la cuenta**, y es lo que se necesita en
    el mostrador: nadie recuerda el numero de cuenta corriente de nadie: se
    tiene el apellido, o el DNI que el cliente esta dictando por telefono, o el
    CUIT que figura en una factura.

    Se busca en los tres campos a la vez y sin distinguir mayusculas. El DNI y
    el CUIT comparten columna (`dni_cuit`), asi que **tambien se ignoran los
    puntos y los guiones**: el mismo CUIT se escribe `30-71756601-3` en un
    papel y `30716016013` en otro, y obligar a acertar el formato es garantizar
    que la busqueda falle justo cuando hay alguien esperando.
    """
    consulta = db.query(CuentaCorriente)

    termino = (q or "").strip()
    if termino:
        patron = f"%{termino.lower()}%"
        # Solo digitos, para que un CUIT con separadores encuentre al mismo
        # cliente cargado sin ellos, y al reves.
        digitos = "".join(c for c in termino if c.isdigit())

        condiciones = [
            func.lower(Cliente.nombre_completo).like(patron),
            func.lower(func.coalesce(Cliente.razon_social, "")).like(patron),
            func.lower(Cliente.dni_cuit).like(patron),
        ]
        if digitos:
            condiciones.append(
                func.replace(
                    func.replace(Cliente.dni_cuit, "-", ""), ".", ""
                ).like(f"%{digitos}%")
            )

        consulta = consulta.join(
            Cliente, Cliente.id == CuentaCorriente.cliente_id
        ).filter(or_(*condiciones))

    return ok([_cc_response(cc, db) for cc in consulta.all()])


@router.get("/cliente/{cliente_id}")
def get_or_create_cuenta(
    cliente_id: int,
    db: Session = Depends(get_db),
    svc: CuentaCorrienteService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    cc = svc.get_or_create(cliente_id)
    db.commit()
    db.refresh(cc)
    return ok(_cc_response(cc, db, svc))


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
    svc: CuentaCorrienteService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    cc = db.get(CuentaCorriente, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cuenta corriente no encontrada")
    if payload.tipo not in ("debito", "credito"):
        raise HTTPException(status_code=422, detail="tipo debe ser 'debito' o 'credito'")

    try:
        mov = svc.registrar_movimiento(
            cliente_id=cc.cliente_id,
            tipo=payload.tipo,
            concepto=payload.concepto,
            monto=Decimal(str(payload.monto)),
            fecha=payload.fecha,
            creado_por=current_user.id,
            condicion=payload.condicion,
            fecha_vencimiento=payload.fecha_vencimiento,
            alquiler_id=payload.alquiler_id,
            reserva_id=payload.reserva_id,
            pago_id=payload.pago_id,
            echeq_id=payload.echeq_id,
            multa_id=payload.multa_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    db.refresh(mov)
    return ok(MovimientoResponse.model_validate(mov), "Movimiento registrado")


@router.post("/movimientos/{movimiento_id}/anular")
def anular_movimiento(
    movimiento_id: int,
    payload: AnularRequest,
    db: Session = Depends(get_db),
    svc: CuentaCorrienteService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Anula un movimiento con un contra-asiento (tipo opuesto, mismo monto).
    El movimiento original NUNCA se edita ni se borra — queda marcado
    `anulado=True` y enlazado al contra-asiento que lo revirtió.
    """
    existente = db.get(MovimientoCuentaCorriente, movimiento_id)
    if not existente:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    if existente.anulado:
        raise HTTPException(status_code=409, detail="El movimiento ya está anulado")

    try:
        contra = svc.anular_movimiento(movimiento_id, payload.motivo, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    db.refresh(contra)
    return ok(MovimientoResponse.model_validate(contra), "Movimiento anulado")


@router.patch("/movimientos/{movimiento_id}/vencimiento")
def editar_vencimiento(
    movimiento_id: int,
    payload: EditarVencimientoRequest,
    db: Session = Depends(get_db),
    svc: CuentaCorrienteService = Depends(_service),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Corrige a mano la fecha de vencimiento (y opcionalmente la condición) de
    un débito — no toca monto ni saldo, no es un contra-asiento. Cubre el
    caso de ancla=check-in mientras el auto no había vuelto, extensiones, o
    cualquier renegociación. Motivo siempre obligatorio (sin roles todavía
    que restrinjan quién puede hacerlo).
    """
    existente = db.get(MovimientoCuentaCorriente, movimiento_id)
    if not existente:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    try:
        mov = svc.editar_vencimiento(
            movimiento_id=movimiento_id,
            fecha_vencimiento=payload.fecha_vencimiento,
            motivo=payload.motivo,
            usuario_id=current_user.id,
            condicion=payload.condicion,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    db.commit()
    db.refresh(mov)
    return ok(MovimientoResponse.model_validate(mov), "Vencimiento actualizado")
