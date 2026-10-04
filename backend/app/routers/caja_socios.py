"""
La caja como la quiere Franco: alquileres, a cobrar, el mes con los socios, y la
cuenta propia de cada usuario.

Los cobros siguen entrando por `/pagos`; esto es la **vista** sobre ellos. La
cuenta propia (`/caja/propios`) es privada: se filtra por el usuario de la
sesión en el backend.
"""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_admin
from app.core.responses import ok
from app.models.usuario import Usuario
from app.services.caja_socios_service import CajaSociosService

router = APIRouter(prefix="/caja", tags=["Caja"])


class SocioIn(BaseModel):
    id: int
    porcentaje: Decimal | None = None
    usuario_id: int | None = None
    activo: bool | None = None


class SociosIn(BaseModel):
    socios: list[SocioIn]


class FacturadoIn(BaseModel):
    # None = volver a "según con factura" (todo o nada).
    monto_facturado: Decimal | None = None


class SocioDePagoIn(BaseModel):
    socio_id: int | None = None


class RepartirIn(BaseModel):
    mes: date
    notas: str | None = None


class PropioIn(BaseModel):
    fecha: date
    concepto: str
    tipo: str
    monto: Decimal
    medio: str | None = None
    notas: str | None = None


def _socio(s) -> dict:
    return {"id": s.id, "nombre": s.nombre, "porcentaje": float(s.porcentaje),
            "usuario_id": s.usuario_id, "activo": s.activo}


@router.get("/socios")
def listar_socios(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return ok([_socio(s) for s in CajaSociosService(db).socios(solo_activos=False)])


@router.put("/socios")
def guardar_socios(payload: SociosIn, db: Session = Depends(get_db), _: Usuario = Depends(require_admin)):
    svc = CajaSociosService(db)
    return ok([_socio(s) for s in svc.guardar_socios([s.model_dump(exclude_unset=True) for s in payload.socios])])


@router.get("/alquileres")
def alquileres(
    desde: date | None = None, hasta: date | None = None, q: str | None = None,
    cobrado: bool | None = None, pagina: int = Query(1, ge=1), por_pagina: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user),
):
    filas, total = CajaSociosService(db).alquileres(desde, hasta, q, cobrado, pagina, por_pagina)
    return ok({"items": filas, "total": total, "pagina": pagina, "por_pagina": por_pagina})


@router.get("/alquileres/exportar")
def exportar(
    desde: date | None = None, hasta: date | None = None,
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user),
):
    """Las mismas columnas de la planilla, para abrir en Excel."""
    csv_texto = CajaSociosService(db).alquileres_csv(desde, hasta)
    return Response(
        content=csv_texto.encode("utf-8"), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="caja-alquileres.csv"'},
    )


@router.patch("/alquileres/{reserva_id}/facturado")
def cambiar_facturado(
    reserva_id: int, payload: FacturadoIn, db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    svc = CajaSociosService(db)
    svc.actualizar_facturado(reserva_id, payload.monto_facturado, usuario.id)
    filas, _ = svc.alquileres(None, None, None, None, 1, 100000)
    return ok(next((f for f in filas if f["reserva_id"] == reserva_id), None))


@router.get("/a-cobrar")
def a_cobrar(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return ok(CajaSociosService(db).a_cobrar(date.today()))


@router.get("/mes")
def mes(mes: date | None = None, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return ok(CajaSociosService(db).mes(mes or date.today()))


@router.post("/mes/repartir")
def repartir(payload: RepartirIn, db: Session = Depends(get_db), usuario: Usuario = Depends(require_admin)):
    r = CajaSociosService(db).repartir(payload.mes, usuario.id, payload.notas)
    return ok({"id": r.id, "mes": r.mes.isoformat(), "transferencias": r.transferencias}, "Mes repartido")


@router.post("/repartos/{reparto_id}/anular")
def anular_reparto(reparto_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(require_admin)):
    CajaSociosService(db).anular_reparto(reparto_id, usuario.id)
    return ok(None, "Reparto anulado")


@router.patch("/pagos/{pago_id}/socio")
def socio_del_pago(
    pago_id: int, payload: SocioDePagoIn, db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    p = CajaSociosService(db).asignar_socio_a_pago(pago_id, payload.socio_id, usuario.id)
    return ok({"id": p.id, "socio_id": p.socio_id})


# ─── La cuenta propia: privada de cada usuario ──────────────────────────────

@router.get("/propios")
def propios(
    desde: date | None = None, hasta: date | None = None,
    db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user),
):
    return ok(CajaSociosService(db).propios(usuario.id, desde, hasta))


@router.post("/propios", status_code=201)
def anotar_propio(payload: PropioIn, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    m = CajaSociosService(db).anotar_propio(
        usuario.id, payload.fecha, payload.concepto, payload.tipo, payload.monto, payload.medio, payload.notas)
    return ok({"id": m.id})


@router.delete("/propios/{movimiento_id}")
def anular_propio(movimiento_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    CajaSociosService(db).anular_propio(usuario.id, movimiento_id)
    return ok(None, "Anotación anulada")
