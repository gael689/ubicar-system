"""
Router de Emails — el registro de todo lo que el sistema mandó, y el único
envío que se dispara a mano (ofertas y descuentos).

Vive pegado a Notificaciones en la interfaz: son la misma pregunta ("¿qué
avisó el sistema?") vista desde adentro y desde afuera.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.email import (
    DestinatarioResponse,
    EmailDetalleResponse,
    EmailEnviadoResponse,
    EnviarOfertaRequest,
    EstadoIntegracionResponse,
    PrevisualizarOfertaRequest,
    ReintentarRequest,
)
from app.services.email_service import EmailService

router = APIRouter(prefix="/emails", tags=["Emails"])


def _service(db: Session = Depends(get_db)) -> EmailService:
    return EmailService(db)


@router.get("")
def list_emails(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    tipo: str | None = Query(None, description="Uno o varios separados por coma"),
    estado: str | None = Query(None, description="enviado, fallido, omitido"),
    destinatario: str | None = Query(None, description="Búsqueda parcial por casilla"),
    service: EmailService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """Lo que se mandó, lo más reciente primero."""
    items, total = service.list(
        page=page, page_size=page_size, tipo=tipo, estado=estado, destinatario=destinatario
    )
    return paginated(
        [EmailEnviadoResponse.model_validate(i) for i in items], total, page, page_size
    )


@router.get("/estado")
def estado_integracion(
    service: EmailService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """
    Cómo está parada la integración con Resend ahora mismo.

    Existe para que el panel pueda decir **por qué** un mail no salió en vez de
    mostrar un "omitido" sin explicación. Mientras el remitente sea el de
    prueba, esto es lo que sostiene el cartel de arriba de la pantalla.
    """
    return ok(EstadoIntegracionResponse(**service.estado()).model_dump())


@router.get("/destinatarios")
def destinatarios(
    solo_con_alquileres: bool = Query(True),
    service: EmailService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """Los clientes con casilla cargada, para armar el envío de ofertas."""
    return ok([DestinatarioResponse(**d).model_dump() for d in service.destinatarios_de_clientes(solo_con_alquileres)])


@router.post("/previsualizar")
def previsualizar_oferta(
    payload: PrevisualizarOfertaRequest,
    _: Usuario = Depends(get_current_user),
):
    """
    El HTML de la oferta tal como va a salir, sin mandar nada.

    Ver el mail antes de mandarlo a doscientos clientes no es un lujo: es la
    única forma de darse cuenta de que faltó un renglón.
    """
    from app.services.email_plantillas import oferta

    asunto, html = oferta(payload.asunto, payload.cuerpo)
    return ok({"asunto": asunto, "html": html})


@router.post("/oferta")
def enviar_oferta(
    payload: EnviarOfertaRequest,
    db: Session = Depends(get_db),
    service: EmailService = Depends(_service),
    user: Usuario = Depends(get_current_user),
):
    """Manda la oferta, uno por destinatario, y registra cada envío."""
    try:
        registros = service.enviar_oferta(
            destinatarios=[str(d) for d in payload.destinatarios],
            titulo=payload.asunto,
            cuerpo=payload.cuerpo,
            usuario_id=user.id,
            forzar=payload.forzar,
        )
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()

    enviados = sum(1 for r in registros if r.estado == "enviado")
    omitidos = sum(1 for r in registros if r.estado == "omitido")
    fallidos = sum(1 for r in registros if r.estado == "fallido")
    if omitidos and not enviados:
        mensaje = f"{omitidos} sin enviar: el remitente configurado es el de prueba de Resend"
    else:
        mensaje = f"{enviados} enviados, {fallidos} fallidos, {omitidos} omitidos"
    return ok(
        {
            "total": len(registros),
            "enviados": enviados,
            "fallidos": fallidos,
            "omitidos": omitidos,
            "items": [EmailEnviadoResponse.model_validate(r).model_dump() for r in registros],
        },
        mensaje,
    )


@router.get("/{id}")
def get_email(
    id: int,
    service: EmailService = Depends(_service),
    _: Usuario = Depends(get_current_user),
):
    """El registro completo, con el cuerpo que se mandó."""
    try:
        registro = service.get(id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(EmailDetalleResponse.model_validate(registro).model_dump())


@router.post("/{id}/reintentar")
def reintentar_email(
    id: int,
    payload: ReintentarRequest | None = None,
    db: Session = Depends(get_db),
    service: EmailService = Depends(_service),
    user: Usuario = Depends(get_current_user),
):
    """Vuelve a intentar un envío fallido u omitido, con el mismo cuerpo."""
    try:
        registro = service.reintentar(
            id, usuario_id=user.id, forzar=bool(payload and payload.forzar)
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    return ok(
        EmailEnviadoResponse.model_validate(registro).model_dump(),
        "Enviado" if registro.estado == "enviado" else f"No salió: {registro.motivo or 'sin detalle'}",
    )
