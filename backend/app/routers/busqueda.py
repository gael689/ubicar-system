"""
Búsqueda global (Fase 3, ítem 42): Cmd/Ctrl+K desde cualquier pantalla.
Busca cliente, patente/vehículo y reserva en un solo request — reutiliza
los mismos filtros `q` que ya tienen los listados de cada módulo, no
duplica lógica de búsqueda.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.responses import ok
from app.models.usuario import Usuario
from app.repositories.cliente_repo import ClienteRepository
from app.repositories.reserva_repo import ReservaRepo
from app.repositories.vehiculo_repo import VehiculoRepository

router = APIRouter(tags=["Búsqueda"])

LIMITE_POR_TIPO = 5


@router.get("/buscar")
def buscar_global(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    q = q.strip()
    resultados: list[dict] = []

    clientes, _ = ClienteRepository(db).list_filtered(q=q, skip=0, limit=LIMITE_POR_TIPO)
    for c in clientes:
        resultados.append({
            "tipo": "cliente",
            "id": c.id,
            "titulo": c.nombre_completo,
            "subtitulo": c.dni_cuit,
            "url": f"/clientes/{c.id}",
        })

    vehiculos, _ = VehiculoRepository(db).list_filtered(q=q, skip=0, limit=LIMITE_POR_TIPO)
    for v in vehiculos:
        resultados.append({
            "tipo": "vehiculo",
            "id": v.id,
            "titulo": v.patente,
            "subtitulo": f"{v.marca} {v.modelo}",
            "url": f"/flota/{v.id}",
        })

    reserva_repo = ReservaRepo(db)
    reservas, _ = reserva_repo.list(q=q, page=1, page_size=LIMITE_POR_TIPO)
    reservas_ids = {r.id for r in reservas}
    # Si buscan un número, probablemente sea el ID de la reserva puntual —
    # el filtro por q sólo matchea contra el cliente, así que se suma aparte.
    if q.lstrip("#").isdigit():
        reserva_directa = reserva_repo.get(int(q.lstrip("#")))
        if reserva_directa and reserva_directa.id not in reservas_ids:
            reservas = [reserva_directa] + reservas

    for r in reservas[:LIMITE_POR_TIPO]:
        cliente_nombre = r.cliente.nombre_completo if r.cliente else "?"
        vehiculo_patente = r.vehiculo.patente if r.vehiculo else "?"
        resultados.append({
            "tipo": "reserva",
            "id": r.id,
            "titulo": f"Reserva #{r.id} — {cliente_nombre}",
            "subtitulo": f"{vehiculo_patente} · {r.fecha_inicio} → {r.fecha_fin} · {r.estado}",
            "url": "/reservas",
        })

    return ok(resultados)
