from decimal import Decimal

from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import BusinessRuleError
from app.core.responses import ok
from app.models.usuario import Usuario
from app.models.presupuesto import Presupuesto
from app.models.vehiculo import Vehiculo
from app.models.tarifa import Tarifa
from app.domain.enums import TipoTarifa
from app.domain.tarifas import seleccionar_tarifa, calcular_precio_total, TarifaInfo
from app.schemas.presupuesto import PresupuestoCreate, PresupuestoResponse
from app.utils.helpers import calcular_dias

router = APIRouter(prefix="/cotizador", tags=["Cotizador"])


@router.post("/calcular")
def calcular_cotizacion(
    vehiculo_id: int | None = Query(None, description="Vehículo puntual (tiene prioridad)"),
    categoria_id: int | None = Query(None, description="Categoría, si todavía no se eligió vehículo puntual"),
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Sugiere una tarifa para el cotizador con el mismo motor de precios que
    usan reservas/alquileres (D-08: vehículo específico > categoría >
    general). El operador puede editar el monto sugerido a mano — esto es
    sólo un punto de partida, no un precio final.
    """
    dias = calcular_dias(fecha_inicio, fecha_fin)

    categoria_efectiva = categoria_id
    if vehiculo_id is not None:
        vehiculo = db.query(Vehiculo).filter(Vehiculo.id == vehiculo_id).first()
        categoria_efectiva = vehiculo.categoria_id if vehiculo else categoria_id

    # Trae tanto las del vehículo puntual (si hay) como las generales/de categoría.
    filtro_vehiculo = (Tarifa.vehiculo_id == vehiculo_id) | (Tarifa.vehiculo_id.is_(None)) if vehiculo_id else Tarifa.vehiculo_id.is_(None)
    tarifas = db.query(Tarifa).filter(Tarifa.activo == True, filtro_vehiculo).all()
    tarifas_info = [
        TarifaInfo(
            id=t.id, tipo=TipoTarifa(t.tipo), monto=Decimal(str(t.monto)),
            vehiculo_id=t.vehiculo_id, categoria_id=t.categoria_id,
        )
        for t in tarifas
    ]

    try:
        tarifa = seleccionar_tarifa(dias, tarifas_info, categoria_efectiva)
        tarifa_sugerida = tarifa.monto  # precio por día, banda ya resuelta (diaria/semanal/mensual)
        total_sugerido = calcular_precio_total(dias, tarifa)
    except BusinessRuleError:
        tarifa_sugerida = None
        total_sugerido = None

    return ok({"dias": dias, "tarifa_sugerida": tarifa_sugerida, "total_sugerido": total_sugerido})


@router.get("/presupuestos")
def list_presupuestos(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    items = db.query(Presupuesto).order_by(Presupuesto.created_at.desc()).all()
    return ok([PresupuestoResponse.model_validate(p) for p in items])


@router.post("/presupuestos", status_code=status.HTTP_201_CREATED)
def create_presupuesto(
    payload: PresupuestoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    dias = calcular_dias(payload.fecha_inicio, payload.fecha_fin)
    total = dias * payload.tarifa_unitaria * (1 - payload.descuento / 100)
    presupuesto = Presupuesto(**payload.model_dump(), dias=dias, total=total, created_by=current_user.id)
    db.add(presupuesto)
    db.commit()
    db.refresh(presupuesto)
    return ok(PresupuestoResponse.model_validate(presupuesto), "Presupuesto creado")
