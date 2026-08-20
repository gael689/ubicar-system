from __future__ import annotations
"""
Disponibilidad para el mostrador.

**El mismo cálculo que la web, sin las puertas de la web.**
`GET /public/disponibilidad` ya devolvía cupo, última unidad y entrega por
rotación, pero cuelga de tres cosas que sólo tienen sentido de cara al cliente:
la ventana comercial (anticipación mínima, horizonte, duración máxima), la edad
mínima para alquilar online, y un rate limit por IP. Ninguna de las tres aplica
al mostrador: ahí hay alguien atendiendo que puede tomar una reserva para
dentro de una hora, para dentro de un año, o para un menor con un responsable
firmando.

Lo que **no** se duplica es el cálculo: los dos endpoints llaman al mismo
`DisponibilidadService`, que es el único que sabe contar cupo. Tener dos
cuentas de cupo es tener dos verdades sobre cuántos autos hay, y la que
descubrís tarde es la mala.
"""
from datetime import date, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.responses import ok
from app.models.categoria import Categoria
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.services.disponibilidad_service import DisponibilidadService

router = APIRouter(prefix="/disponibilidad", tags=["Disponibilidad"])


@router.get("/interna")
def get_disponibilidad_interna(
    fecha_inicio: date = Query(..., description="Retiro, ISO YYYY-MM-DD"),
    fecha_fin: date = Query(..., description="Devolución, ISO YYYY-MM-DD"),
    hora_inicio: time = Query(time(10, 0)),
    hora_fin: time = Query(time(10, 0)),
    canal: str = Query("mostrador", pattern="^(web|mostrador)$"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Cupo y precio por categoría para el rango, con el criterio del mostrador.

    Tres diferencias con la versión pública, todas a propósito:

    - **Todas las categorías activas**, no sólo las publicables (`solo_web`).
      Una categoría que no se vende online igual se alquila por teléfono.
    - **Precio de mostrador.** Mostrar el de la web sería mostrar un número que
      después no se cobra.
    - **Sin ventana comercial.** El horizonte y la anticipación mínima existen
      para que nadie compre online algo que no se puede preparar; con alguien
      del otro lado del mostrador esa decisión la toma una persona.

    Cada categoría trae `disponibles`, `hay_cupo`, `ultima_unidad` y —cuando no
    hay cupo pero una unidad vuelve ese mismo día— `rotacion`, con la hora de
    entrega que se puede ofrecer y a qué hora vuelve el auto que la habilita.
    """
    categorias = DisponibilidadService(db).consultar(
        fecha_inicio, hora_inicio, fecha_fin, hora_fin,
        solo_web=False,
        canal=canal,
    )
    return ok({
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "dias": (fecha_fin - fecha_inicio).days,
        "categorias": categorias,
    })


@router.get("/vehiculos")
def get_vehiculos_libres(
    fecha_inicio: date = Query(...),
    fecha_fin: date = Query(...),
    hora_inicio: time = Query(time(10, 0)),
    hora_fin: time = Query(time(10, 0)),
    categoria_id: int | None = Query(
        None, description="La categoría pedida: sus autos van primero y marcados"
    ),
    excluir_reserva_id: int | None = Query(
        None, description="Una reserva que no debe competir contra sí misma"
    ),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Los autos libres de verdad en un rango de fechas, **sin necesitar una
    reserva ya guardada**.

    Es la misma respuesta que `GET /reservas/{id}/vehiculos-disponibles`, que
    sólo servía para una reserva existente. Al **crear** una reserva la reserva
    todavía no existe, así que el formulario no tenía a quién preguntarle y
    ofrecía la flota entera: se podía elegir un auto ya comprometido y el
    conflicto aparecía como advertencia recién después de guardar.

    Se devuelven todas las categorías, no sólo la pedida: dar un upgrade es una
    decisión comercial válida. Los de la categoría pedida van primero y
    marcados, y se avisa cuál sería un downgrade — mismo criterio que
    `ReservaService.asignar_vehiculo` (D-54).

    Es una sugerencia, no una reserva: crear revalida contra el auto elegido.
    """
    libres_por_categoria = DisponibilidadService(db).unidades_libres(
        fecha_inicio, hora_inicio, fecha_fin, hora_fin,
        excluir_reserva_id=excluir_reserva_id,
    )

    ids = [vid for lista in libres_por_categoria.values() for vid in lista]
    vehiculos = (
        db.query(Vehiculo).filter(Vehiculo.id.in_(ids)).all() if ids else []
    )
    categorias = db.query(Categoria).all()
    nombres = {c.id: c.nombre for c in categorias}
    ordenes = {c.id: c.orden for c in categorias}
    orden_pedido = ordenes.get(categoria_id) if categoria_id else None

    items = [
        {
            "id": v.id,
            "patente": v.patente,
            "marca": v.marca,
            "modelo": v.modelo,
            "anio": v.anio,
            "color": v.color,
            "estado": v.estado,
            "categoria_id": v.categoria_id,
            "categoria_nombre": nombres.get(v.categoria_id),
            "es_categoria_pedida": (
                categoria_id is not None and v.categoria_id == categoria_id
            ),
            "es_downgrade": (
                orden_pedido is not None
                and v.categoria_id != categoria_id
                and ordenes.get(v.categoria_id) is not None
                and ordenes[v.categoria_id] < orden_pedido
            ),
        }
        for v in vehiculos
    ]
    items.sort(key=lambda i: (not i["es_categoria_pedida"], i["patente"] or ""))

    return ok({
        "categoria_id": categoria_id,
        "categoria_nombre": nombres.get(categoria_id) if categoria_id else None,
        "vehiculos": items,
    })
