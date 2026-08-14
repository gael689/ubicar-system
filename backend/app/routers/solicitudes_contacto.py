"""
Bandeja de "Piden que los llamemos" (D-61).

Alguien vio el panel de derivación —porque sus fechas caen dentro de los días
que la web no cierra sola, porque la categoría que quería no tenía cupo, o
porque pidió un lugar fuera de los habituales— y en vez de escribir por
WhatsApp eligió dejar sus datos.

**No son reservas y por eso viven en su propia tabla.** Se muestran en la
misma pantalla que la bandeja de reservas web, pero en una sección aparte y
arriba de todo: el mostrador tiene que ver de un vistazo la diferencia entre
"esta persona reservó" y "a esta persona le prometimos una llamada".

El ciclo es de dos pasos y a propósito no tiene más: `pendiente` → se la
llamó (`contactado`) → se cierra (`cerrado`). Si de esa llamada sale una
reserva, la reserva se carga por el camino normal; forzar un vínculo entre
las dos cosas sería volver a mezclar lo que esta tabla vino a separar.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.exceptions import NotFoundError
from app.core.responses import ok
from app.models.solicitud_contacto import SolicitudContacto
from app.models.usuario import Usuario

router = APIRouter(prefix="/solicitudes-contacto", tags=["Solicitudes de contacto"])


class ResolverRequest(BaseModel):
    """Qué pasó al llamar. Opcional: obligar a escribir algo hace que la
    gente escriba cualquier cosa para poder cerrar el ítem."""
    resultado: str | None = None


def _serializar(s: SolicitudContacto) -> dict:
    return {
        "id": s.id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "motivo": s.motivo,
        "nombre": s.nombre,
        "telefono": s.telefono,
        "email": s.email,
        "categoria_id": s.categoria_id,
        "categoria_nombre": s.categoria.nombre if s.categoria else None,
        "fecha_inicio": s.fecha_inicio.isoformat() if s.fecha_inicio else None,
        "fecha_fin": s.fecha_fin.isoformat() if s.fecha_fin else None,
        "hora_inicio": s.hora_inicio.isoformat() if s.hora_inicio else None,
        "hora_fin": s.hora_fin.isoformat() if s.hora_fin else None,
        "lugar_retiro": s.lugar_retiro,
        "lugar_devolucion": s.lugar_devolucion,
        "lugar_texto_libre": s.lugar_texto_libre,
        "edad_declarada": s.edad_declarada,
        "notas": s.notas,
        "estado": s.estado,
        "resuelta_en": s.resuelta_en.isoformat() if s.resuelta_en else None,
        "resultado": s.resultado,
    }


@router.get("")
def listar(
    estado: str | None = Query(None, description="pendiente | contactado | cerrado"),
    db: Session = Depends(get_db),
    _usuario: Usuario = Depends(get_current_user),
):
    """Las solicitudes, la más nueva primero. Por default sólo las que todavía
    esperan una llamada — que es lo único accionable."""
    q = db.query(SolicitudContacto)
    q = q.filter(SolicitudContacto.estado == (estado or "pendiente"))
    filas = q.order_by(SolicitudContacto.created_at.desc()).all()
    return ok([_serializar(s) for s in filas])


@router.get("/resumen")
def resumen(
    db: Session = Depends(get_db),
    _usuario: Usuario = Depends(get_current_user),
):
    """Cuántas esperan una llamada. Alimenta el contador del menú."""
    pendientes = (
        db.query(SolicitudContacto)
        .filter(SolicitudContacto.estado == "pendiente")
        .count()
    )
    return ok({"pendientes": pendientes})


def _obtener(db: Session, solicitud_id: int) -> SolicitudContacto:
    solicitud = db.get(SolicitudContacto, solicitud_id)
    if solicitud is None:
        raise NotFoundError("Solicitud de contacto", solicitud_id)
    return solicitud


@router.post("/{solicitud_id}/contactado", status_code=status.HTTP_200_OK)
def marcar_contactado(
    solicitud_id: int,
    payload: ResolverRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Ya se lo llamó. Queda registrado quién y cuándo — la promesa era una
    llamada, así que saber si se cumplió no es un detalle."""
    solicitud = _obtener(db, solicitud_id)
    solicitud.estado = "contactado"
    solicitud.resuelta_por = usuario.id
    solicitud.resuelta_en = datetime.utcnow()
    if payload.resultado:
        solicitud.resultado = payload.resultado
    db.commit()
    return ok(_serializar(solicitud), "Marcada como contactada")


@router.post("/{solicitud_id}/cerrar", status_code=status.HTTP_200_OK)
def cerrar(
    solicitud_id: int,
    payload: ResolverRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Se terminó el asunto — alquiló, no le servía, o no atendió."""
    solicitud = _obtener(db, solicitud_id)
    solicitud.estado = "cerrado"
    solicitud.resuelta_por = usuario.id
    solicitud.resuelta_en = datetime.utcnow()
    if payload.resultado:
        solicitud.resultado = payload.resultado
    db.commit()
    return ok(_serializar(solicitud), "Cerrada")
