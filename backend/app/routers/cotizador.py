from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import BusinessRuleError
from app.core.responses import ok
from app.models.cliente import Cliente
from app.models.usuario import Usuario
from app.models.presupuesto import Presupuesto
from app.models.vehiculo import Vehiculo
from app.models.tarifa import Tarifa
from app.domain.enums import TipoTarifa
from app.domain.tarifas import cotizar_por_bandas, TarifaInfo
from app.schemas.presupuesto import PresupuestoCreate, PresupuestoResponse
from app.utils.helpers import calcular_dias

router = APIRouter(prefix="/cotizador", tags=["Cotizador"])


class AsignarClienteRequest(BaseModel):
    cliente_id: int


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
            canal=t.canal,
        )
        for t in tarifas
    ]

    try:
        # Canal `mostrador`: una cotización comercial se arma desde el
        # mostrador, no desde el sitio. Si no hay tarifa propia de mostrador
        # cae sola a la compartida (`ambos`).
        cot = cotizar_por_bandas(dias, tarifas_info, categoria_efectiva, "mostrador", vehiculo_id)
        total_sugerido = cot.total
        # Precio efectivo por día. Desde D-35 el `monto` de una tarifa semanal
        # es el de la semana completa, así que mostrarlo tal cual como "tarifa
        # sugerida" sería siete veces el número que el cliente espera ver.
        tarifa_sugerida = (cot.total / Decimal(dias)).quantize(Decimal("0.01"))
        detalle_bandas = [
            {
                "tipo": b.tipo.value,
                "cantidad": b.cantidad,
                "dias": b.dias,
                "precio_bloque": b.precio_bloque,
                "subtotal": b.subtotal,
            }
            for b in cot.bloques
        ]
    except BusinessRuleError:
        tarifa_sugerida = None
        total_sugerido = None
        detalle_bandas = []

    return ok({
        "dias": dias,
        "tarifa_sugerida": tarifa_sugerida,
        "total_sugerido": total_sugerido,
        "detalle_bandas": detalle_bandas,
    })


@router.get("/presupuestos")
def list_presupuestos(
    cliente_id: int | None = Query(None, description="Sólo los de este cliente"),
    huerfanas: bool = Query(
        False,
        description="Sólo las cotizaciones sin cliente asignado",
    ),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Las cotizaciones guardadas.

    **`huerfanas=true` es el caso que da sentido a que `cliente_id` sea
    nullable**: se le cotiza a alguien que todavía no es cliente. Crear un
    cliente por cada consulta ensucia la base con gente que nunca alquiló, pero
    sin cliente el presupuesto es un PDF que no deja rastro en ningún lado.
    Guardarlas sueltas y poder asignarlas después resuelve las dos cosas.
    """
    q = db.query(Presupuesto)
    if huerfanas:
        q = q.filter(Presupuesto.cliente_id.is_(None))
    elif cliente_id is not None:
        q = q.filter(Presupuesto.cliente_id == cliente_id)
    items = q.order_by(Presupuesto.created_at.desc()).all()
    return ok([PresupuestoResponse.model_validate(p) for p in items])


@router.patch("/presupuestos/{presupuesto_id}/cliente")
def asignar_cliente(
    presupuesto_id: int,
    payload: AsignarClienteRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Le pone dueño a una cotización huérfana.

    Es la segunda mitad de lo anterior: se cotizó a alguien suelto, esa persona
    volvió y se dio de alta, y ahora la cotización tiene que aparecer en su
    historial.
    """
    presupuesto = db.get(Presupuesto, presupuesto_id)
    if not presupuesto:
        raise HTTPException(status_code=404, detail="No existe ese presupuesto.")

    cliente = db.get(Cliente, payload.cliente_id)
    if not cliente or not cliente.activo:
        raise HTTPException(status_code=404, detail="No existe ese cliente.")

    presupuesto.cliente_id = cliente.id
    db.commit()
    db.refresh(presupuesto)
    return ok(PresupuestoResponse.model_validate(presupuesto), "Cotización asignada")


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
