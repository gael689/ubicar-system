"""
Motor de precios por calendario (Fase 5, ítem 57 — plan §7.2).

`POST /precios/calcular` es el endpoint que consumen el sistema interno, el
cotizador y la web: una sola fuente de precios, con desglose día por día.
El resto son el ABM de las reglas y la grilla de la pantalla de
administración.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.responses import ok
from app.models.categoria import Categoria
from app.models.fecha_especial import FechaEspecial
from app.models.tarifa_calendario import DescuentoDuracion, TarifaCalendario
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.schemas.precio import (
    CalcularPrecioRequest,
    CalendarioPreciosResponse,
    CotizacionResponse,
    DescuentoDuracionCreate,
    DescuentoDuracionResponse,
    DescuentoDuracionUpdate,
    TarifaCalendarioCreate,
    TarifaCalendarioResponse,
    TarifaCalendarioUpdate,
)
from app.services import auditoria_service
from app.services.precio_service import PrecioService

router = APIRouter(prefix="/precios", tags=["Precios"])


# ─── Auditoría de las reglas ──────────────────────────────────────────────────
#
# El precio es la decisión más cara del sistema: una regla mal cargada no
# rompe nada, simplemente factura de menos —o de más— hasta que alguien lo
# note semanas después. `creado_por` dice quién la creó; lo que faltaba era
# quién le tocó el precio, quién la dio de baja y qué decía antes.

def _estado_regla(r: TarifaCalendario) -> dict:
    return {
        "nombre": r.nombre,
        "precio_dia": r.precio_dia,
        "fecha_desde": r.fecha_desde,
        "fecha_hasta": r.fecha_hasta,
        "fecha_especial_id": r.fecha_especial_id,
        "prioridad": r.prioridad,
        "categoria_id": r.categoria_id,
        "vehiculo_id": r.vehiculo_id,
        "canal": r.canal,
        "es_promocional": r.es_promocional,
        "activo": r.activo,
    }


def _estado_descuento(d: DescuentoDuracion) -> dict:
    return {
        "nombre": d.nombre,
        "porcentaje": d.porcentaje,
        "dias_desde": d.dias_desde,
        "dias_hasta": d.dias_hasta,
        "categoria_id": d.categoria_id,
        "activo": d.activo,
    }


VERBO = {
    "crear": "Creó", "editar": "Editó",
    "dar_de_baja": "Dio de baja", "reactivar": "Reactivó",
}


def _auditar(
    db: Session, usuario: Usuario, accion: str, obj,
    antes: dict | None = None, despues: dict | None = None,
) -> None:
    es_regla = isinstance(obj, TarifaCalendario)
    auditoria_service.registrar(
        db,
        usuario_id=usuario.id,
        accion=accion,
        entidad_tipo="regla_precio" if es_regla else "descuento_duracion",
        entidad_id=obj.id,
        descripcion=(
            f"{VERBO[accion]} "
            f"{'la regla de precio' if es_regla else 'el descuento por duración'} "
            f"«{obj.nombre}»"
            + (f" (${obj.precio_dia}/día)" if es_regla else f" ({obj.porcentaje}%)")
        ),
        datos_antes=antes,
        datos_despues=despues,
        monto=obj.precio_dia if es_regla else None,
    )


# ─── Cotización ───────────────────────────────────────────────────────────────

@router.post("/calcular")
def calcular_precio(
    payload: CalcularPrecioRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Cotiza un alquiler resolviendo el precio día por día.

    Devuelve el **desglose completo**, no sólo el total: es lo que permite
    mostrarle al cliente por qué paga lo que paga, y lo que hace que el
    módulo sea debuggeable cuando alguien discute un importe.
    """
    service = PrecioService(db)
    try:
        cotizacion, categoria_id = service.calcular(
            fecha_inicio=payload.fecha_inicio,
            fecha_fin=payload.fecha_fin,
            categoria_id=payload.categoria_id,
            vehiculo_id=payload.vehiculo_id,
            canal=payload.canal,
            adicionales=[(a.adicional_id, a.cantidad) for a in payload.adicionales],
            fecha_nacimiento=payload.fecha_nacimiento,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok(CotizacionResponse(
        dias=[d.__dict__ for d in cotizacion.dias],
        duracion_dias=cotizacion.duracion_dias,
        subtotal=cotizacion.subtotal,
        descuento_porcentaje=cotizacion.descuento_porcentaje,
        descuento_monto=cotizacion.descuento_monto,
        descuento_nombre=cotizacion.descuento_nombre,
        subtotal_vehiculo=cotizacion.subtotal_vehiculo,
        adicionales=[a.__dict__ for a in cotizacion.adicionales],
        total_adicionales=cotizacion.total_adicionales,
        recargo_edad=(
            cotizacion.recargo_edad.__dict__ if cotizacion.recargo_edad else None
        ),
        total=cotizacion.total,
        precio_dia_promedio=cotizacion.precio_dia_promedio,
        total_referencia=cotizacion.total_referencia,
        tiene_promocion=cotizacion.tiene_promocion,
        promociones=cotizacion.promociones,
        categoria_id=categoria_id,
        vehiculo_id=payload.vehiculo_id,
    ))


@router.get("/calendario")
def get_calendario(
    desde: date = Query(...),
    hasta: date = Query(...),
    canal: str = Query("mostrador", pattern="^(web|mostrador)$"),
    categoria_id: list[int] | None = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Grilla de precios para la pantalla de administración: categorías en filas,
    días en columnas, con el precio ya resuelto por celda.
    """
    if hasta < desde:
        raise HTTPException(status_code=422, detail="El rango de fechas está invertido")
    if (hasta - desde).days > 400:
        raise HTTPException(
            status_code=422, detail="El rango no puede superar los 400 días"
        )
    filas = PrecioService(db).calendario(desde, hasta, canal, categoria_id)
    return ok(CalendarioPreciosResponse(
        desde=desde, hasta=hasta, canal=canal, filas=filas,
    ))


# ─── ABM de reglas ────────────────────────────────────────────────────────────

def _get_regla(db: Session, regla_id: int) -> TarifaCalendario:
    regla = db.get(TarifaCalendario, regla_id)
    if not regla:
        raise HTTPException(status_code=404, detail="Regla de precio no encontrada")
    return regla


def _validar_referencias(db: Session, regla: TarifaCalendario) -> None:
    if regla.categoria_id and db.get(Categoria, regla.categoria_id) is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if regla.vehiculo_id and db.get(Vehiculo, regla.vehiculo_id) is None:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    if regla.fecha_especial_id and db.get(FechaEspecial, regla.fecha_especial_id) is None:
        raise HTTPException(status_code=404, detail="Fecha especial no encontrada")


def _serializar_regla(db: Session, regla: TarifaCalendario) -> TarifaCalendarioResponse:
    """Enriquece la regla con los nombres y el rango efectivo, para que el
    frontend no tenga que cruzar tres listados ni resolver la herencia."""
    resp = TarifaCalendarioResponse.model_validate(regla)
    if regla.categoria_id:
        cat = db.get(Categoria, regla.categoria_id)
        resp.categoria_nombre = cat.nombre if cat else None
    if regla.vehiculo_id:
        veh = db.get(Vehiculo, regla.vehiculo_id)
        resp.vehiculo_patente = veh.patente if veh else None

    fe = db.get(FechaEspecial, regla.fecha_especial_id) if regla.fecha_especial_id else None
    if fe:
        resp.fecha_especial_nombre = fe.nombre
    desde, hasta = PrecioService._rango_efectivo(regla, fe)
    resp.vigencia_desde, resp.vigencia_hasta = desde, hasta
    return resp


@router.get("/reglas")
def list_reglas(
    categoria_id: int | None = Query(None),
    vehiculo_id: int | None = Query(None),
    solo_promociones: bool = Query(False),
    vigentes_al: date | None = Query(None, description="Sólo las que cubren esta fecha"),
    incluir_inactivas: bool = Query(False),
    canal: str | None = Query(
        None,
        description="'web' o 'mostrador'. Incluye también las de canal 'ambos', "
                    "que son las que rigen en los dos.",
    ),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(TarifaCalendario)
    if not incluir_inactivas:
        q = q.filter(TarifaCalendario.activo.is_(True))
    if categoria_id is not None:
        q = q.filter(TarifaCalendario.categoria_id == categoria_id)
    if vehiculo_id is not None:
        q = q.filter(TarifaCalendario.vehiculo_id == vehiculo_id)
    if solo_promociones:
        q = q.filter(TarifaCalendario.es_promocional.is_(True))
    if canal in ("web", "mostrador"):
        # `ambos` entra a propósito: una regla de canal 'ambos' **sí** rige en
        # este canal. Excluirla haría que la pantalla de precios web mostrara
        # una lista de reglas que no explica los precios de su propia grilla.
        q = q.filter(TarifaCalendario.canal.in_([canal, "ambos"]))

    reglas = q.order_by(
        TarifaCalendario.prioridad.desc(), TarifaCalendario.id.desc()
    ).all()
    items = [_serializar_regla(db, r) for r in reglas]

    # El filtro por vigencia se aplica sobre el rango efectivo, que puede venir
    # heredado de una fecha especial y por lo tanto no es filtrable en SQL.
    if vigentes_al is not None:
        items = [
            i for i in items
            if i.vigencia_desde and i.vigencia_hasta
            and i.vigencia_desde <= vigentes_al <= i.vigencia_hasta
        ]
    return ok(items)


@router.post("/reglas", status_code=status.HTTP_201_CREATED)
def create_regla(
    payload: TarifaCalendarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    regla = TarifaCalendario(**payload.model_dump(), creado_por=current_user.id)
    _validar_referencias(db, regla)
    db.add(regla)
    db.flush()
    _auditar(db, current_user, "crear", regla, despues=_estado_regla(regla))
    db.commit()
    db.refresh(regla)
    return ok(_serializar_regla(db, regla), "Regla de precio creada")


@router.patch("/reglas/{regla_id}")
def update_regla(
    regla_id: int,
    payload: TarifaCalendarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    regla = _get_regla(db, regla_id)
    antes = _estado_regla(regla)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(regla, campo, valor)

    # Las validaciones cruzadas del schema miran sólo el payload; al aplicar un
    # PATCH parcial hay que revalidar contra el estado final de la fila.
    if regla.categoria_id and regla.vehiculo_id:
        raise HTTPException(
            status_code=422,
            detail="Una regla es de una categoría o de un vehículo puntual, no de ambos",
        )
    if regla.fecha_especial_id and (regla.fecha_desde or regla.fecha_hasta):
        raise HTTPException(
            status_code=422,
            detail="Si la regla hereda el rango de una fecha especial, no lleva fechas propias",
        )
    if not regla.fecha_especial_id and not (regla.fecha_desde and regla.fecha_hasta):
        raise HTTPException(
            status_code=422, detail="La regla necesita un rango de fechas"
        )
    if regla.fecha_desde and regla.fecha_hasta and regla.fecha_hasta < regla.fecha_desde:
        raise HTTPException(
            status_code=422, detail="La fecha de fin no puede ser anterior a la de inicio"
        )
    if regla.es_promocional and not regla.etiqueta_promo:
        raise HTTPException(
            status_code=422,
            detail="Una promoción necesita etiqueta: es el texto que ve el cliente",
        )
    _validar_referencias(db, regla)

    cambio_antes, cambio_despues = auditoria_service.diferencias(antes, _estado_regla(regla))
    if cambio_antes:
        _auditar(db, current_user, "editar", regla, antes=cambio_antes, despues=cambio_despues)
    db.commit()
    db.refresh(regla)
    return ok(_serializar_regla(db, regla), "Regla de precio actualizada")


@router.delete("/reglas/{regla_id}")
def deactivate_regla(
    regla_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Baja lógica. NUNCA borra el registro.

    Además de la regla general del sistema, acá tiene un motivo propio: una
    reserva vieja cotizada con esta regla queda sin explicación si la fila
    desaparece. Dar de baja la promo hace que vuelva a aplicar el precio de
    abajo, que es exactamente el comportamiento buscado.
    """
    regla = _get_regla(db, regla_id)
    regla.activo = False
    _auditar(db, current_user, "dar_de_baja", regla)
    db.commit()
    db.refresh(regla)
    return ok(_serializar_regla(db, regla), "Regla de precio dada de baja")


@router.post("/reglas/{regla_id}/reactivar")
def reactivate_regla(
    regla_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    regla = _get_regla(db, regla_id)
    regla.activo = True
    _auditar(db, current_user, "reactivar", regla)
    db.commit()
    db.refresh(regla)
    return ok(_serializar_regla(db, regla), "Regla de precio reactivada")


# ─── ABM de descuentos por duración ───────────────────────────────────────────

def _get_descuento(db: Session, descuento_id: int) -> DescuentoDuracion:
    d = db.get(DescuentoDuracion, descuento_id)
    if not d:
        raise HTTPException(status_code=404, detail="Descuento no encontrado")
    return d


def _serializar_descuento(db: Session, d: DescuentoDuracion) -> DescuentoDuracionResponse:
    resp = DescuentoDuracionResponse.model_validate(d)
    if d.categoria_id:
        cat = db.get(Categoria, d.categoria_id)
        resp.categoria_nombre = cat.nombre if cat else None
    return resp


@router.get("/descuentos")
def list_descuentos(
    incluir_inactivos: bool = Query(False),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(DescuentoDuracion)
    if not incluir_inactivos:
        q = q.filter(DescuentoDuracion.activo.is_(True))
    items = q.order_by(DescuentoDuracion.dias_desde).all()
    return ok([_serializar_descuento(db, d) for d in items])


@router.post("/descuentos", status_code=status.HTTP_201_CREATED)
def create_descuento(
    payload: DescuentoDuracionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if payload.categoria_id and db.get(Categoria, payload.categoria_id) is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    d = DescuentoDuracion(**payload.model_dump(), creado_por=current_user.id)
    db.add(d)
    db.flush()
    _auditar(db, current_user, "crear", d, despues=_estado_descuento(d))
    db.commit()
    db.refresh(d)
    return ok(_serializar_descuento(db, d), "Descuento creado")


@router.patch("/descuentos/{descuento_id}")
def update_descuento(
    descuento_id: int,
    payload: DescuentoDuracionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    d = _get_descuento(db, descuento_id)
    antes = _estado_descuento(d)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(d, campo, valor)
    if d.dias_hasta is not None and d.dias_hasta < d.dias_desde:
        raise HTTPException(
            status_code=422, detail="dias_hasta no puede ser menor que dias_desde"
        )
    if d.categoria_id and db.get(Categoria, d.categoria_id) is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    cambio_antes, cambio_despues = auditoria_service.diferencias(antes, _estado_descuento(d))
    if cambio_antes:
        _auditar(db, current_user, "editar", d, antes=cambio_antes, despues=cambio_despues)
    db.commit()
    db.refresh(d)
    return ok(_serializar_descuento(db, d), "Descuento actualizado")


@router.delete("/descuentos/{descuento_id}")
def deactivate_descuento(
    descuento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Baja lógica. NUNCA borra el registro."""
    d = _get_descuento(db, descuento_id)
    d.activo = False
    _auditar(db, current_user, "dar_de_baja", d)
    db.commit()
    db.refresh(d)
    return ok(_serializar_descuento(db, d), "Descuento dado de baja")


@router.post("/descuentos/{descuento_id}/reactivar")
def reactivate_descuento(
    descuento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    d = _get_descuento(db, descuento_id)
    d.activo = True
    _auditar(db, current_user, "reactivar", d)
    db.commit()
    db.refresh(d)
    return ok(_serializar_descuento(db, d), "Descuento reactivado")
