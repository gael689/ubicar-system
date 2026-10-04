"""
Prospectos y campañas de captación de Ubicar.

Dos clases de llamadores:

- **La pantalla de Ubicar** (usuarios con sesión): ver, filtrar, seleccionar en
  masa, armar campañas.
- **El buscador de Gael** (corre en su máquina, no tiene sesión): empuja los
  prospectos curados a `/prospectos/importar` con un token compartido
  (`PROSPECTOS_TOKEN`). Sin token configurado, ese endpoint está apagado.
"""
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user, get_db
from app.core.responses import ok
from app.models.prospecto import CampanaProspecto, Prospecto
from app.models.usuario import Usuario
from app.services.prospecto_service import MAXIMO_POR_SELECCION, ProspectoService

router = APIRouter(prefix="/prospectos", tags=["Prospectos"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class FiltroProspectos(BaseModel):
    q: str | None = None
    segmento: str | None = None
    ciudad: str | None = None
    estado: str | None = None
    con_mail: bool | None = None
    con_telefono: bool | None = None
    score_min: int | None = None
    contacto_previo: bool | None = None
    solo_contactables: bool | None = None


class Seleccion(BaseModel):
    """Una selección: ids a mano, o **todos los que cumplen un filtro**."""
    ids: list[int] | None = None
    filtro: FiltroProspectos | None = None


class ProspectoImportado(BaseModel):
    ref_externa: str | None = None
    nombre: str
    segmento: str | None = None
    ciudad: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    email: str | None = None
    website: str | None = None
    instagram: str | None = None
    score: int | None = None
    contacto_previo: bool = False
    contacto_previo_detalle: str | None = None
    no_contactar: bool = False
    no_contactar_motivo: str | None = None
    notas: str | None = None


class ImportarRequest(BaseModel):
    prospectos: list[ProspectoImportado] = Field(max_length=2000)


class CambiarEstadoRequest(Seleccion):
    estado: str


class CrearCampanaRequest(Seleccion):
    nombre: str
    incluir_contacto_previo: bool = False


class MensajeRequest(BaseModel):
    asunto: str | None = None
    cuerpo: str | None = None


# ─── Serialización ───────────────────────────────────────────────────────────

def _prospecto(p: Prospecto) -> dict:
    return {
        "id": p.id, "nombre": p.nombre, "segmento": p.segmento, "ciudad": p.ciudad,
        "direccion": p.direccion, "telefono": p.telefono, "email": p.email,
        "website": p.website, "instagram": p.instagram, "score": p.score,
        "estado": p.estado,
        "es_cliente": p.es_cliente,
        "ya_cliente_id": p.ya_cliente_id,
        "ya_cliente_nombre": (
            (p.ya_cliente.razon_social or p.ya_cliente.nombre_completo) if p.ya_cliente else None
        ),
        "cruce_por": p.cruce_por, "cruce_descartado": p.cruce_descartado,
        "contacto_previo": p.contacto_previo, "contacto_previo_detalle": p.contacto_previo_detalle,
        "no_contactar": p.no_contactar, "no_contactar_motivo": p.no_contactar_motivo,
        "notas": p.notas,
    }


def _campana(svc: ProspectoService, c: CampanaProspecto) -> dict:
    return {
        "id": c.id, "nombre": c.nombre, "canal": c.canal, "estado": c.estado,
        "asunto": c.asunto, "cuerpo": c.cuerpo,
        "incluir_contacto_previo": c.incluir_contacto_previo, "filtro": c.filtro,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "lanzada_at": c.lanzada_at.isoformat() if c.lanzada_at else None,
        **svc.resumen_de_campana(c),
    }


def _ids(svc: ProspectoService, sel: Seleccion) -> list[int]:
    if sel.ids:
        return list(dict.fromkeys(sel.ids))
    if sel.filtro is not None:
        return svc.ids_por_filtro(sel.filtro.model_dump(exclude_none=True))
    return []


# ─── El buscador de Gael ─────────────────────────────────────────────────────

@router.post("/importar")
def importar(
    payload: ImportarRequest,
    x_token_prospectos: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Alta o actualización por lote. Auth por token, no por sesión."""
    esperado = settings.prospectos_token
    if not esperado:
        raise HTTPException(status_code=503, detail="La importación de prospectos no está habilitada.")
    if not x_token_prospectos or not hmac.compare_digest(x_token_prospectos, esperado):
        raise HTTPException(status_code=401, detail="Token inválido.")
    resultado = ProspectoService(db).importar([p.model_dump() for p in payload.prospectos])
    return ok(resultado)


# ─── La pantalla ─────────────────────────────────────────────────────────────

@router.post("/importar-archivo")
def importar_archivo(
    payload: ImportarRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Lo mismo que `/importar`, pero **con la sesión de quien está en la pantalla**
    y sin token: sirve para subir el archivo que arma el sincronizador
    (`--archivo`) sin tener que configurar nada en el servidor.
    """
    return ok(ProspectoService(db).importar([p.model_dump() for p in payload.prospectos]))


@router.get("")
def listar(
    q: str | None = None, segmento: str | None = None, ciudad: str | None = None,
    estado: str | None = None, con_mail: bool | None = None, con_telefono: bool | None = None,
    score_min: int | None = None, contacto_previo: bool | None = None,
    solo_contactables: bool | None = None,
    pagina: int = Query(1, ge=1), por_pagina: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user),
):
    svc = ProspectoService(db)
    filtro = {k: v for k, v in dict(
        q=q, segmento=segmento, ciudad=ciudad, estado=estado, con_mail=con_mail,
        con_telefono=con_telefono, score_min=score_min, contacto_previo=contacto_previo,
        solo_contactables=solo_contactables,
    ).items() if v not in (None, "", False)}
    items, total = svc.listar(filtro, pagina, por_pagina)
    return ok({"items": [_prospecto(p) for p in items], "total": total,
               "pagina": pagina, "por_pagina": por_pagina})


@router.get("/resumen")
def resumen(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return ok(ProspectoService(db).resumen())


@router.post("/seleccion/contar")
def contar_seleccion(sel: Seleccion, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """Cuántos prospectos son: para el cartel 'seleccionar los N que cumplen el filtro'."""
    ids = _ids(ProspectoService(db), sel)
    return ok({"cantidad": min(len(ids), MAXIMO_POR_SELECCION),
               "supera_el_maximo": len(ids) > MAXIMO_POR_SELECCION,
               "maximo": MAXIMO_POR_SELECCION})


@router.post("/cruzar")
def cruzar(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """Vuelve a cruzar contra los clientes (por si se cargaron clientes nuevos)."""
    return ok({"ya_clientes": ProspectoService(db).cruzar()})


@router.post("/estado")
def cambiar_estado(
    payload: CambiarEstadoRequest, db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ProspectoService(db)
    return ok({"cambiados": svc.cambiar_estado(_ids(svc, payload), payload.estado)})


@router.post("/{prospecto_id}/no-es-cliente")
def no_es_cliente(prospecto_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """'No es el mismo': descarta un cruce por nombre que era un falso positivo."""
    return ok(_prospecto(ProspectoService(db).descartar_cruce(prospecto_id)))


# ─── Campañas ────────────────────────────────────────────────────────────────

@router.get("/campanas")
def listar_campanas(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    svc = ProspectoService(db)
    campanas = db.query(CampanaProspecto).order_by(CampanaProspecto.id.desc()).all()
    return ok([_campana(svc, c) for c in campanas])


@router.post("/campanas", status_code=201)
def crear_campana(
    payload: CrearCampanaRequest, db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    svc = ProspectoService(db)
    ids = _ids(svc, payload)
    filtro = payload.filtro.model_dump(exclude_none=True) if payload.filtro else None
    campana = svc.crear_campana(payload.nombre, ids, filtro, payload.incluir_contacto_previo, usuario.id)
    return ok(_campana(svc, campana), "Campaña creada en borrador")


@router.get("/campanas/{campana_id}")
def ver_campana(campana_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    svc = ProspectoService(db)
    c = svc.get_campana(campana_id)
    data = _campana(svc, c)
    data["items"] = [
        {"prospecto": _prospecto(d.prospecto), "estado": d.estado, "motivo": d.motivo}
        for d in c.destinatarios
    ]
    return ok(data)


@router.put("/campanas/{campana_id}/mensaje")
def guardar_mensaje(
    campana_id: int, payload: MensajeRequest, db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ProspectoService(db)
    return ok(_campana(svc, svc.actualizar_mensaje(campana_id, payload.asunto, payload.cuerpo)))


@router.post("/campanas/{campana_id}/preparar")
def preparar_campana(campana_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """Deja la campaña lista. **No envía**: el envío se enciende más adelante."""
    svc = ProspectoService(db)
    return ok(_campana(svc, svc.preparar(campana_id)), "Campaña lista. El envío todavía no está encendido.")
