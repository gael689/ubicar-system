"""
Tablero de Uber (21/11/2026).

Los contratos de Uber vigentes con su semana en curso, y las cuatro cosas que se
hacen sobre ellos sin salir de la pantalla: cobrar la semana, cargar el km,
renovar y avisar por WhatsApp (esto último es sólo un link, lo arma el frontend).

Toda la lógica está en `services/uber_service.py`; acá sólo se valida la entrada
y se traduce el error.
"""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.core.responses import ok
from app.models.usuario import Usuario
from app.schemas.pago import MedioPago
from app.services.uber_service import MAX_SEMANAS_RENOVACION, UberService

router = APIRouter(prefix="/uber", tags=["Uber"])


def _mensaje(e: Exception) -> str:
    """`[regla] mensaje` → `mensaje`: el código es para el log, no para el mostrador."""
    texto = str(e)
    if texto.startswith("[") and "] " in texto:
        return texto.split("] ", 1)[1]
    return texto


class CobrarSemanaRequest(BaseModel):
    # Editable: un pago parcial deja la semana a medias, y uno mayor cubre
    # también las siguientes ("Cobrar todo lo atrasado").
    monto: Decimal = Field(gt=0)
    medio_pago: MedioPago
    fecha: date
    notas: str | None = None


class LecturaKmRequest(BaseModel):
    fecha: date
    km: int = Field(ge=0)


class RenovarRequest(BaseModel):
    semanas: int = Field(ge=1, le=MAX_SEMANAS_RENOVACION)
    # Sin valor se renueva al mismo de siempre.
    valor_semana: Decimal | None = Field(default=None, gt=0)
    # La primera vez va en false: si la renovación pisa otra reserva del auto,
    # vuelve un 409 que lo explica y el operador decide si renueva igual.
    permitir_solape: bool = False


@router.get("/tablero")
def tablero(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return ok(UberService(db).tablero())


@router.post("/contratos/{alquiler_id}/cobrar-semana", status_code=status.HTTP_201_CREATED)
def cobrar_semana(
    alquiler_id: int,
    payload: CobrarSemanaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Un cobro común (el mismo de `POST /pagos`), con la semana ya elegida."""
    svc = UberService(db)
    try:
        pago = svc.cobrar_semana(
            alquiler_id,
            monto=payload.monto,
            medio_pago=payload.medio_pago,
            fecha=payload.fecha,
            usuario_id=current_user.id,
            notas=payload.notas,
        )
        db.commit()
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (BusinessRuleError, ValueError) as e:
        raise HTTPException(status_code=422, detail=_mensaje(e))
    hoy = date.today()
    return ok(
        {"pago_id": pago.id, "contrato": svc.serializar(svc.contrato(alquiler_id, hoy), hoy)},
        "Cobro registrado",
    )


@router.post("/contratos/{alquiler_id}/lecturas-km", status_code=status.HTTP_201_CREATED)
def cargar_km(
    alquiler_id: int,
    payload: LecturaKmRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Anota una lectura del odómetro. No cobra nada: informa cómo viene."""
    try:
        lectura, consumo = UberService(db).registrar_lectura(
            alquiler_id, fecha=payload.fecha, km=payload.km, usuario_id=current_user.id
        )
        db.commit()
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=_mensaje(e))
    return ok(
        {
            "id": lectura.id,
            "fecha": lectura.fecha.isoformat(),
            "km": lectura.km,
            **UberService._consumo_json(consumo),
        },
        "Lectura registrada",
    )


@router.post("/contratos/{alquiler_id}/renovar")
def renovar(
    alquiler_id: int,
    payload: RenovarRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Agrega semanas al contrato y genera sus cuotas."""
    svc = UberService(db)
    try:
        alquiler, avisos = svc.renovar(
            alquiler_id,
            semanas=payload.semanas,
            valor_semana=payload.valor_semana,
            usuario_id=current_user.id,
            permitir_solape=payload.permitir_solape,
        )
        db.commit()
    except ConflictError as e:
        partes = str(e).split("|")
        if partes[0] == "solapamiento_extension" and len(partes) >= 6:
            detalle = (
                f"El auto ya tiene otra reserva en esas fechas: #{partes[2]} de {partes[3]}, "
                f"del {partes[4]} al {partes[5]}. Podés renovar igual y resolver el cruce después."
            )
        else:
            detalle = partes[1] if len(partes) > 1 else str(e)
        raise HTTPException(status_code=409, detail=detalle)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=_mensaje(e))
    hoy = date.today()
    return ok(
        {"contrato": svc.serializar(svc.contrato(alquiler.id, hoy), hoy), "warnings": avisos},
        "Contrato renovado",
    )
