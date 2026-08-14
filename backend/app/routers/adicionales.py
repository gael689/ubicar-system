"""
Adicionales: coberturas y extras que se suman a un alquiler
(Fase 5, ítem 56 — plan §7.4).

**Los cargan los dueños con su precio.** La lista no está cerrada y cambia
con la temporada, por eso es un ABM y no un enum en el código.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.adicional import Adicional, ReservaAdicional
from app.models.usuario import Usuario
from app.schemas.adicional import (
    AdicionalCreate, AdicionalResponse, AdicionalUpdate,
)

router = APIRouter(prefix="/adicionales", tags=["Adicionales"])


def _get(db: Session, adicional_id: int) -> Adicional:
    a = db.get(Adicional, adicional_id)
    if not a:
        raise HTTPException(status_code=404, detail="Adicional no encontrado")
    return a


def _precio_comparable(a: Adicional) -> Decimal | None:
    """
    Un número para comparar "cuánto cuesta" entre coberturas, sin mezclar
    unidades: por porcentaje sólo contra otro por porcentaje, monto fijo sólo
    contra otro monto fijo con la misma unidad de cobro. `None` cuando no hay
    con qué comparar — la validación de abajo se lo salta en ese caso, no
    inventa una relación.
    """
    if a.porcentaje_sobre_alquiler is not None:
        return Decimal(str(a.porcentaje_sobre_alquiler))
    return None


def _validar_franquicia(db: Session, a: Adicional) -> None:
    """
    Plan de conexión (13/08), D-53 — punto 3 de §3.8b: es lo único que
    impide volver a cargar la tabla al revés (franquicia $0 más barata que
    la base, que es exactamente el bug que este plan vino a arreglar).

    Dos reglas, sólo para coberturas con franquicia cargada:

    1. **Ninguna franquicia de cobertura puede ser ≥ la base más baja entre
       las categorías activas.** Si lo fuera, contratar esa "cobertura" no
       bajaría nada para ninguna categoría — dejaría de ser una cobertura.
    2. **A menor franquicia, mayor precio.** Comparado sólo contra otras
       coberturas con una unidad de precio compatible (ver
       `_precio_comparable`): mezclar porcentaje con monto fijo no da una
       comparación real.
    """
    if a.grupo != "cobertura" or a.franquicia is None:
        return

    from app.models.categoria import Categoria

    base_minima = (
        db.query(func.min(Categoria.franquicia_base))
        .filter(Categoria.activo.is_(True), Categoria.franquicia_base.isnot(None))
        .scalar()
    )
    if base_minima is not None and Decimal(str(a.franquicia)) >= Decimal(str(base_minima)):
        raise HTTPException(
            status_code=422,
            detail=(
                f"La franquicia de una cobertura tiene que ser menor a la base más "
                f"baja entre las categorías (${base_minima:,.0f}). Si no, no baja nada."
            ),
        )

    precio_propio = _precio_comparable(a)
    if precio_propio is None:
        return

    otras = (
        db.query(Adicional)
        .filter(
            Adicional.grupo == "cobertura",
            Adicional.activo.is_(True),
            Adicional.franquicia.isnot(None),
            Adicional.id != (a.id or -1),
        )
        .all()
    )
    for otra in otras:
        precio_otra = _precio_comparable(otra)
        if precio_otra is None:
            continue
        franquicia_propia = Decimal(str(a.franquicia))
        franquicia_otra = Decimal(str(otra.franquicia))
        if franquicia_propia < franquicia_otra and precio_propio <= precio_otra:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"'{a.nombre}' deja una franquicia más baja que '{otra.nombre}' "
                    "pero no cuesta más — revisá los precios."
                ),
            )
        if franquicia_propia > franquicia_otra and precio_propio >= precio_otra:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"'{a.nombre}' deja una franquicia más alta que '{otra.nombre}' "
                    "pero cuesta igual o más — revisá los precios."
                ),
            )


@router.get("")
def list_adicionales(
    grupo: str | None = Query(None, pattern="^(cobertura|extra)$"),
    solo_web: bool = Query(False, description="Sólo los publicados en la web"),
    incluir_inactivos: bool = Query(False),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = db.query(Adicional)
    if not incluir_inactivos:
        q = q.filter(Adicional.activo.is_(True))
    if grupo:
        q = q.filter(Adicional.grupo == grupo)
    if solo_web:
        q = q.filter(Adicional.visible_web.is_(True))
    items = q.order_by(Adicional.grupo, Adicional.orden, Adicional.nombre).all()
    return ok([AdicionalResponse.model_validate(a) for a in items])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_adicional(
    payload: AdicionalCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    existente = db.query(Adicional).filter(Adicional.codigo == payload.codigo).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un adicional con el código '{payload.codigo}'",
        )
    a = Adicional(**payload.model_dump(), creado_por=current_user.id)
    _validar_franquicia(db, a)
    db.add(a)
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional creado")


@router.patch("/{adicional_id}")
def update_adicional(
    adicional_id: int,
    payload: AdicionalUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Cambiar el precio acá **no** reescribe las reservas ya cargadas: cada
    `ReservaAdicional` congeló su precio al contratarse.
    """
    a = _get(db, adicional_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(a, campo, valor)
    if a.grupo == "extra" and a.franquicia is not None:
        raise HTTPException(
            status_code=422,
            detail="La franquicia sólo aplica a las coberturas, no a los extras",
        )
    _validar_franquicia(db, a)
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional actualizado")


@router.delete("/{adicional_id}")
def deactivate_adicional(
    adicional_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Baja lógica. NUNCA borra el registro: las reservas que lo contrataron
    tienen que poder seguir mostrando qué se les cobró.
    """
    a = _get(db, adicional_id)
    a.activo = False
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional dado de baja")


@router.post("/{adicional_id}/reactivar")
def reactivate_adicional(
    adicional_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    a = _get(db, adicional_id)
    a.activo = True
    db.commit()
    db.refresh(a)
    return ok(AdicionalResponse.model_validate(a), "Adicional reactivado")


@router.get("/reserva/{reserva_id}")
def list_adicionales_de_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Adicionales contratados en una reserva, con el precio que se pactó."""
    items = (
        db.query(ReservaAdicional)
        .filter(ReservaAdicional.reserva_id == reserva_id)
        .order_by(ReservaAdicional.id)
        .all()
    )
    return ok([
        {
            "id": ra.id,
            "adicional_id": ra.adicional_id,
            "nombre": ra.adicional.nombre if ra.adicional else None,
            "grupo": ra.adicional.grupo if ra.adicional else None,
            "cantidad": ra.cantidad,
            "precio_unitario": ra.precio_unitario,
            "unidad_cobro": ra.unidad_cobro,
            "subtotal": ra.subtotal,
        }
        for ra in items
    ])
