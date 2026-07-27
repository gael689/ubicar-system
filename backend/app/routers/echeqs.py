from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.cliente import Cliente
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.echeq import Echeq
from app.schemas.echeq import EcheqCreate, EcheqUpdate, EcheqResponse
from app.services.cuenta_corriente_service import CuentaCorrienteService
from app.services.echeq_service import EcheqService
from app.services.notificacion_service import NotificacionService

router = APIRouter(prefix="/echeqs", tags=["Echeqs"])


def _echeq_response(echeq: Echeq, db: Session) -> dict:
    data = EcheqResponse.model_validate(echeq).model_dump()
    if echeq.cliente_id:
        cliente = db.get(Cliente, echeq.cliente_id)
        data["cliente_nombre"] = cliente.nombre_completo if cliente else None
    data["datos_completos"] = bool(echeq.banco and echeq.numero_cheque and echeq.fecha_cobro)
    return data


def _revertir_credito_si_existe(echeq: Echeq, db: Session, motivo: str, usuario_id: int) -> None:
    """Anula (contra-asiento) el crédito que el echeq generó al entrar en
    cartera, si todavía está vigente. No hace nada si nunca generó uno."""
    if not echeq.movimiento_cc_id:
        return
    mov = db.get(MovimientoCuentaCorriente, echeq.movimiento_cc_id)
    if mov and not mov.anulado:
        CuentaCorrienteService(db).anular_movimiento(mov.id, motivo=motivo, creado_por=usuario_id)


@router.get("")
def list_echeqs(
    estado: str | None = Query(None),
    tipo: str | None = Query(None),
    cliente_id: int | None = Query(None),
    incluir_inactivos: bool = Query(False, description="Si true, incluye los dados de baja"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Echeq)
    if not incluir_inactivos:
        q = q.filter(Echeq.activo == True)
    if estado:
        q = q.filter(Echeq.estado == estado)
    if tipo:
        q = q.filter(Echeq.tipo == tipo)
    if cliente_id:
        q = q.filter(Echeq.cliente_id == cliente_id)
    echeqs = q.order_by(Echeq.fecha_cobro).all()
    return ok([_echeq_response(e, db) for e in echeqs])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_echeq(
    payload: EcheqCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    # Un echeq RECIBIDO de un cliente identificado es, a los fines de la
    # cuenta corriente, un cobro: entra en cartera y ya genera el crédito
    # (aunque todavía no se hizo efectivo — ver docs/PLAN_MAESTRO.md 3.4).
    # Si más adelante rebota, se revierte con un contra-asiento (ver abajo).
    # Misma lógica que usa ReservaService.create() cuando el medio de pago
    # elegido es "echeq" — centralizada en EcheqService para no duplicarla.
    if payload.tipo == "recibido" and payload.cliente_id:
        echeq = EcheqService(db).crear_recibido(
            cliente_id=payload.cliente_id,
            contraparte=payload.contraparte,
            monto=Decimal(str(payload.monto)),
            fecha_emision=payload.fecha_emision,
            creado_por=current_user.id,
            banco=payload.banco,
            numero_cheque=payload.numero_cheque,
            fecha_cobro=payload.fecha_cobro,
            reserva_id=payload.reserva_id,
            alquiler_id=payload.alquiler_id,
            gasto_id=payload.gasto_id,
            notas=payload.notas,
        )
    else:
        echeq = Echeq(**payload.model_dump(), creado_por=current_user.id)
        db.add(echeq)
        db.flush()  # asegurar echeq.id

    db.commit()
    db.refresh(echeq)
    return ok(_echeq_response(echeq, db), "Echeq registrado")


@router.patch("/{echeq_id}")
def update_echeq(
    echeq_id: int,
    payload: EcheqUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    echeq = db.query(Echeq).filter(Echeq.id == echeq_id).first()
    if not echeq:
        raise HTTPException(status_code=404, detail="Echeq no encontrado")

    cambios = payload.model_dump(exclude_none=True)
    nuevo_estado = cambios.get("estado")

    if nuevo_estado == "rechazado" and echeq.estado != "rechazado":
        if not payload.motivo_rechazo:
            raise HTTPException(status_code=422, detail="Rechazar un echeq requiere motivo_rechazo")
        _revertir_credito_si_existe(
            echeq, db, motivo=f"Echeq #{echeq.numero_cheque} rechazado", usuario_id=current_user.id
        )

    for field, value in cambios.items():
        setattr(echeq, field, value)

    if nuevo_estado == "rechazado" and echeq.estado == "rechazado":
        # Alerta al instante (D-19/PLAN_MAESTRO §4.2: "al registrarlo", no
        # espera a la corrida de las 08:00 del scheduler).
        NotificacionService(db).generar_una({
            "tipo": "echeq_rechazado",
            "titulo": "Echeq rechazado",
            "descripcion": f"Echeq de {echeq.contraparte} — ${echeq.monto} — {echeq.motivo_rechazo}",
            "urgencia": "critica",
            "entidad_tipo": "echeq",
            "entidad_id": echeq.id,
            "url_destino": "/caja",
            "fecha_objetivo": None,
        })

    db.commit()
    db.refresh(echeq)
    return ok(_echeq_response(echeq, db), "Echeq actualizado")


@router.delete("/{echeq_id}")
def deactivate_echeq(
    echeq_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Baja lógica. NUNCA borra el registro. Si tenía un crédito vigente en
    la cuenta corriente del cliente, lo anula con un contra-asiento primero."""
    echeq = db.query(Echeq).filter(Echeq.id == echeq_id).first()
    if not echeq:
        raise HTTPException(status_code=404, detail="Echeq no encontrado")
    if not echeq.activo:
        return ok(_echeq_response(echeq, db), "El echeq ya estaba dado de baja")

    _revertir_credito_si_existe(
        echeq, db, motivo=f"Echeq #{echeq.numero_cheque} dado de baja", usuario_id=current_user.id
    )
    echeq.activo = False

    db.commit()
    db.refresh(echeq)
    return ok(_echeq_response(echeq, db), "Echeq dado de baja")
