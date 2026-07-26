from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.vehiculo import Vehiculo

router = APIRouter(prefix="/public", tags=["Público"])


@router.get("/disponibilidad")
async def get_disponibilidad(
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    tipo: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Vehiculo).filter(Vehiculo.estado == "disponible", Vehiculo.activo == True)
    if tipo:
        q = q.filter(Vehiculo.tipo == tipo)
    vehiculos = q.all()
    return {
        "data": [
            {
                "id": v.id,
                "marca": v.marca,
                "modelo": v.modelo,
                "tipo": v.tipo,
                "anio": v.anio,
            }
            for v in vehiculos
        ],
        "message": "OK",
        "success": True,
    }


@router.post("/reservas")
async def crear_reserva_publica(
    db: Session = Depends(get_db),
):
    # TODO: implementar reservas online desde landing page
    return {"data": None, "message": "Próximamente", "success": True}
