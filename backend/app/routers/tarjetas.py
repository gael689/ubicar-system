"""
Router de Tarjetas de Cliente.
Acceso protegido: se requiere la contraseña del sistema (Ubicar123) en el header X-Tarjeta-Pin.
La validación es en el backend para que nunca se envíen datos sin autenticación.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.tarjeta_cliente import TarjetaCliente
from app.schemas.tarjeta_cliente import TarjetaClienteCreate, TarjetaClienteResponse

router = APIRouter(prefix="/clientes", tags=["Tarjetas"])

TARJETA_PIN = "Ubicar123"


def _check_pin(x_tarjeta_pin: str | None = Header(None, alias="x-tarjeta-pin")) -> None:
    if x_tarjeta_pin != TARJETA_PIN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PIN incorrecto para acceder a datos de tarjeta",
        )


@router.get("/{cliente_id}/tarjeta", dependencies=[Depends(_check_pin)])
def get_tarjeta(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    tarjeta = db.query(TarjetaCliente).filter(TarjetaCliente.cliente_id == cliente_id).first()
    if not tarjeta:
        return ok(None, "Sin tarjeta registrada")
    return ok(TarjetaClienteResponse.model_validate(tarjeta))


@router.put("/{cliente_id}/tarjeta", dependencies=[Depends(_check_pin)])
def upsert_tarjeta(
    cliente_id: int,
    payload: TarjetaClienteCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    tarjeta = db.query(TarjetaCliente).filter(TarjetaCliente.cliente_id == cliente_id).first()
    if tarjeta:
        tarjeta.nombre_completo = payload.nombre_completo
        tarjeta.nro_tarjeta = payload.nro_tarjeta
        tarjeta.vencimiento = payload.vencimiento
        tarjeta.codigo_3_digitos = payload.codigo_3_digitos
        tarjeta.dni_titular = payload.dni_titular
        db.commit()
        db.refresh(tarjeta)
        return ok(TarjetaClienteResponse.model_validate(tarjeta), "Tarjeta actualizada")
    else:
        nueva = TarjetaCliente(
            cliente_id=cliente_id,
            nombre_completo=payload.nombre_completo,
            nro_tarjeta=payload.nro_tarjeta,
            vencimiento=payload.vencimiento,
            codigo_3_digitos=payload.codigo_3_digitos,
            dni_titular=payload.dni_titular,
        )
        db.add(nueva)
        db.commit()
        db.refresh(nueva)
        return ok(TarjetaClienteResponse.model_validate(nueva), "Tarjeta guardada")


@router.delete("/{cliente_id}/tarjeta", dependencies=[Depends(_check_pin)], status_code=status.HTTP_204_NO_CONTENT)
def delete_tarjeta(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    tarjeta = db.query(TarjetaCliente).filter(TarjetaCliente.cliente_id == cliente_id).first()
    if tarjeta:
        db.delete(tarjeta)
        db.commit()
