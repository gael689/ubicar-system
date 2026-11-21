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
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user, get_db
from app.core.responses import ok
from app.models.prospecto import CampanaProspecto, Prospecto
from app.models.usuario import Usuario
from app.domain import plantillas_prospeccion as plantillas
from app.services.prospeccion_service import ProspeccionService
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
    solo_contactables: bool | None = None
    nunca_contactados: bool | None = None
    segmentos: list[str] | None = None


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
    # Una lista armada a mano puede traer el score con decimales o como texto.
    score: int | float | str | None = None
    no_contactar: bool = False
    no_contactar_motivo: str | None = None
    notas: str | None = None
    # De dónde salió el dato. Se guarda al final de las notas; nunca va en un mail.
    fuente: str | None = None


class ImportarRequest(BaseModel):
    prospectos: list[ProspectoImportado] = Field(max_length=2000)


class CambiarEstadoRequest(Seleccion):
    estado: str


class CrearCampanaRequest(Seleccion):
    nombre: str


class MensajeRequest(BaseModel):
    asunto: str | None = None
    cuerpo: str | None = None


class SeguimientoRequest(BaseModel):
    dias: int
    cuerpo: str


class MensajeDeCampana(BaseModel):
    asunto: str | None = None
    cuerpo: str | None = None
    seguimientos: list[SeguimientoRequest] = Field(default_factory=list, max_length=2)
    firma_nombre: str | None = None
    firma_telefono: str | None = None


class CalcularRequest(Seleccion, MensajeDeCampana):
    # Cuál de las empresas de la lista se muestra en la vista previa.
    indice: int = 0


class PruebaRequest(MensajeDeCampana):
    prospecto_id: int | None = None


class CampanaRapidaRequest(Seleccion, MensajeDeCampana):
    nombre: str
    # `false` = "Guardar lista para enviar": queda armada, no sale.
    enviar: bool = True


class CasillaRequest(BaseModel):
    direccion: str | None = None
    nombre_visible: str
    responder_a: str | None = None
    limite_dia: int | None = None


class DominioRequest(BaseModel):
    nombre: str


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
        "no_contactar": p.no_contactar, "no_contactar_motivo": p.no_contactar_motivo,
        "notas": p.notas,
    }


def _campana(svc: ProspectoService, c: CampanaProspecto) -> dict:
    return {
        "id": c.id, "nombre": c.nombre, "canal": c.canal, "estado": c.estado,
        "asunto": c.asunto, "cuerpo": c.cuerpo,
        "filtro": c.filtro,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "lanzada_at": c.lanzada_at.isoformat() if c.lanzada_at else None,
        "seguimientos": c.seguimientos or [],
        "firma_nombre": c.firma_nombre, "firma_telefono": c.firma_telefono,
        **svc.resumen_de_campana(c),
        "progreso": ProspeccionService(svc.db).progreso(c.id),
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
    simular: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Lo mismo que `/importar`, pero **con la sesión de quien está en la pantalla**
    y sin token: sirve para subir el archivo que arma el sincronizador
    (`--archivo`) o una lista armada a mano, sin configurar nada en el servidor.

    `?simular=true` no guarda nada: devuelve cuántos serían nuevos, cuántos ya
    estaban y cuántos no sirven, para mostrarlo antes de confirmar.
    """
    return ok(ProspectoService(db).importar(
        [p.model_dump() for p in payload.prospectos], simular=simular))


@router.post("", status_code=201)
def agregar_prospecto(
    payload: ProspectoImportado, db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Alta a mano de una empresa. Si ya estaba, completa la que había."""
    p, nuevo = ProspectoService(db).agregar(payload.model_dump())
    return ok({**_prospecto(p), "era_nuevo": nuevo},
              "Empresa agregada" if nuevo else "Esa empresa ya estaba: se completaron sus datos")


@router.get("")
def listar(
    q: str | None = None, segmento: str | None = None, ciudad: str | None = None,
    estado: str | None = None, con_mail: bool | None = None, con_telefono: bool | None = None,
    score_min: int | None = None,
    solo_contactables: bool | None = None,
    nunca_contactados: bool | None = None,
    pagina: int = Query(1, ge=1), por_pagina: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user),
):
    svc = ProspectoService(db)
    filtro = {k: v for k, v in dict(
        q=q, segmento=segmento, ciudad=ciudad, estado=estado, con_mail=con_mail,
        con_telefono=con_telefono, score_min=score_min,
        solo_contactables=solo_contactables, nunca_contactados=nunca_contactados,
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


@router.post("/{prospecto_id}/respondio")
def marcar_respondio(prospecto_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """'Respondió': corta los seguimientos automáticos de esa empresa."""
    ProspectoService(db).get(prospecto_id)
    ProspeccionService(db).marcar_respondio(prospecto_id)
    return ok(_prospecto(ProspectoService(db).get(prospecto_id)), "Anotado: no le salen más seguimientos")


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
    campana = svc.crear_campana(payload.nombre, ids, filtro, usuario.id)
    return ok(_campana(svc, campana), "Campaña creada en borrador")


# ─── Campaña rápida: quiénes → mensaje → mandar ──────────────────────────────

def _mensaje(payload: MensajeDeCampana) -> dict:
    return dict(
        asunto=payload.asunto, cuerpo=payload.cuerpo,
        seguimientos=[s.model_dump() for s in payload.seguimientos],
        firma_nombre=payload.firma_nombre, firma_telefono=payload.firma_telefono,
    )


@router.get("/plantillas")
def ver_plantillas(db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    """Los mails ya escritos, las variables que se pueden insertar y la firma propuesta."""
    return ok({
        "plantillas": plantillas.catalogo(),
        "variables": [{"nombre": v, "ayuda": plantillas.VARIABLES_AYUDA[v]} for v in plantillas.VARIABLES],
        "firma": ProspeccionService(db).firma_por_defecto(usuario),
    })


@router.get("/panel")
def panel(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """La tira de arriba de la pantalla y si hoy se puede mandar."""
    svc = ProspeccionService(db)
    return ok({**svc.resumen(), "envio": svc.estado_del_envio()})


@router.get("/audiencias")
def audiencias(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """Las audiencias de un clic, con cuántas empresas tiene cada una."""
    return ok(ProspeccionService(db).audiencias())


@router.post("/campanas/calcular")
def calcular_campana(payload: CalcularRequest, db: Session = Depends(get_db),
                     _: Usuario = Depends(get_current_user)):
    """Para la pantalla "Nueva campaña": a cuántos les sale, la vista previa y cuándo termina."""
    ids = _ids(ProspectoService(db), payload)[:MAXIMO_POR_SELECCION]
    return ok(ProspeccionService(db).calcular(ids, indice=payload.indice, **_mensaje(payload)))


@router.post("/campanas/prueba")
def enviar_prueba(payload: PruebaRequest, db: Session = Depends(get_db),
                  usuario: Usuario = Depends(get_current_user)):
    """'Enviarme una prueba': el mail tal cual, al usuario que está armando la campaña."""
    r = ProspeccionService(db).enviar_prueba(
        usuario.email, asunto=payload.asunto or "", cuerpo=payload.cuerpo or "",
        firma_nombre=payload.firma_nombre, firma_telefono=payload.firma_telefono,
        prospecto_id=payload.prospecto_id)
    return ok(r, "Simulado: en este entorno no salen mails." if r["simulado"]
              else f"Te la mandamos a {r['para']}")


@router.post("/campanas/rapida", status_code=201)
def crear_campana_rapida(payload: CampanaRapidaRequest, db: Session = Depends(get_db),
                         usuario: Usuario = Depends(get_current_user)):
    """Crea la campaña con su mensaje y, si `enviar`, la deja saliendo."""
    svc = ProspectoService(db)
    ids = _ids(svc, payload)
    if len(ids) > MAXIMO_POR_SELECCION:
        raise HTTPException(status_code=422, detail=f"Son más de {MAXIMO_POR_SELECCION} empresas: filtrá un poco más.")
    campana = ProspeccionService(db).crear_campana_rapida(
        nombre=payload.nombre, ids=ids,
        filtro=payload.filtro.model_dump(exclude_none=True) if payload.filtro else None,
        usuario_id=usuario.id, enviar=payload.enviar,
        **{**_mensaje(payload), "asunto": payload.asunto or "", "cuerpo": payload.cuerpo or ""},
    )
    return ok(_campana(svc, campana),
              "Campaña en marcha" if payload.enviar else "Campaña guardada, lista para enviar")


def _accion(nombre: str, mensaje: str):
    def endpoint(campana_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
        campana = getattr(ProspeccionService(db), nombre)(campana_id)
        return ok(_campana(ProspectoService(db), campana), mensaje)
    endpoint.__name__ = nombre
    return endpoint


router.post("/campanas/{campana_id}/lanzar")(_accion("lanzar", "Campaña en marcha"))
router.post("/campanas/{campana_id}/pausar")(_accion("pausar_campana", "Campaña pausada"))
router.post("/campanas/{campana_id}/reanudar")(_accion("reanudar_campana", "Campaña reanudada"))
router.post("/campanas/{campana_id}/cancelar")(_accion("cancelar_campana", "Campaña cancelada"))


@router.post("/motor/cron")
def cron_del_motor(request: Request, db: Session = Depends(get_db)):
    """
    Una vuelta del motor de envío disparada por un cron **externo**, para el
    caso serverless (en Railway no hace falta: lo corre el scheduler de
    `main.py`). Protegido por `CRON_SECRET`, igual que el de notificaciones.
    """
    if not settings.cron_secret:
        raise HTTPException(status_code=404, detail="El endpoint de cron no está habilitado")
    if not secrets.compare_digest(request.headers.get("authorization", ""),
                                  f"Bearer {settings.cron_secret}"):
        raise HTTPException(status_code=401, detail="No autorizado")
    return ok(ProspeccionService(db).despachar())


# ─── Casillas y dominios ─────────────────────────────────────────────────────

@router.get("/casillas")
def listar_casillas(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    svc = ProspeccionService(db)
    return ok({"casillas": [svc.casilla_dict(c) for c in svc.listar_casillas()], **svc.dominios(),
               "envio": svc.estado_del_envio()})


@router.post("/casillas", status_code=201)
def crear_casilla(payload: CasillaRequest, db: Session = Depends(get_db),
                  _: Usuario = Depends(get_current_user)):
    svc = ProspeccionService(db)
    c = svc.crear_casilla(payload.direccion or "", payload.nombre_visible, payload.responder_a,
                          payload.limite_dia)
    return ok(svc.casilla_dict(c), "Casilla lista para mandar" if c.estado == "activa"
              else "Casilla cargada. Falta verificar su subdominio.")


@router.put("/casillas/{casilla_id}")
def editar_casilla(casilla_id: int, payload: CasillaRequest, db: Session = Depends(get_db),
                   _: Usuario = Depends(get_current_user)):
    svc = ProspeccionService(db)
    return ok(svc.casilla_dict(svc.editar_casilla(
        casilla_id, payload.nombre_visible, payload.responder_a, payload.limite_dia)))


@router.delete("/casillas/{casilla_id}")
def borrar_casilla(casilla_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    ProspeccionService(db).borrar_casilla(casilla_id)
    return ok({"borrada": True})


@router.post("/casillas/{casilla_id}/pausar")
def pausar_casilla(casilla_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    svc = ProspeccionService(db)
    return ok(svc.casilla_dict(svc.pausar_casilla(casilla_id)), "Casilla pausada")


@router.post("/casillas/{casilla_id}/reactivar")
def reactivar_casilla(casilla_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    svc = ProspeccionService(db)
    return ok(svc.casilla_dict(svc.reactivar_casilla(casilla_id)))


@router.post("/casillas/{casilla_id}/confirmar")
def confirmar_casilla(casilla_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """'Ya está verificado': para cuando el sistema no puede preguntárselo a Resend."""
    svc = ProspeccionService(db)
    return ok(svc.casilla_dict(svc.revisar_casilla(casilla_id, confirmo=True)))


@router.post("/dominios")
def crear_dominio(payload: DominioRequest, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """Crea el subdominio en Resend y devuelve los registros DNS que hay que cargar."""
    return ok(ProspeccionService(db).crear_dominio(payload.nombre))


@router.post("/dominios/verificar")
def verificar_dominio(payload: DominioRequest, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    """'Verificar ahora': Resend vuelve a mirar el DNS."""
    return ok(ProspeccionService(db).verificar_dominio(payload.nombre))


@router.get("/campanas/{campana_id}")
def ver_campana(campana_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    svc = ProspectoService(db)
    c = svc.get_campana(campana_id)
    data = _campana(svc, c)
    data["envios"] = ProspeccionService(db).envios_de_campana(c.id)
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
    """Deja la campaña lista. **No envía**: para eso está `/lanzar`."""
    svc = ProspectoService(db)
    return ok(_campana(svc, svc.preparar(campana_id)), "Campaña lista para enviar.")
