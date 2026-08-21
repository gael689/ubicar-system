from __future__ import annotations
"""
Router de Reservas — Fase 3 completo.
"""
import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.adapters.storage import IStorage
from app.core.deps import get_db, get_current_user, get_storage
from app.models.reserva import Reserva
from app.services.reserva_documento_service import ReservaDocumentoService
from app.core.exceptions import ConflictError, NotFoundError, BusinessRuleError
from app.core.responses import ok, paginated
from app.models.usuario import Usuario
from app.schemas.alquiler import CheckoutCreate, AlquilerResponse
from app.schemas.reserva import (
    ReservaCreate,
    ReservaUpdate,
    ReservaResponse,
    ReasignarRequest,
    CancelarReservaRequest,
    SolapeWarning,
    BloqueoItemResponse,
    SemaforoResponse,
)
from app.services.email_service import EmailService
from app.services.reserva_service import ReservaService
from app.services.alquiler_service import AlquilerService

from app.schemas.pago import MedioPago

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reservas", tags=["Reservas"])


class RegistrarCobroRequest(BaseModel):
    """
    Plata que ya entró por una reserva que todavía no salió a la calle.

    `confirmar` viene en `True` porque el caso real es la transferencia web:
    quien la ve en el extracto está confirmando la reserva, no cargando un
    dato. Se puede apagar para registrar una seña sin comprometer el auto.
    """
    monto: Decimal = Field(gt=0)
    medio_pago: MedioPago = "transferencia"
    fecha: date | None = None
    # El número de operación de la transferencia. Es lo que después permite
    # cruzar el cobro con el extracto cuando alguien pregunta.
    referencia: str | None = None
    confirmar: bool = True


class AsignarVehiculoRequest(BaseModel):
    vehiculo_id: int
    # Concurrencia optimista: qué auto creía la pantalla que tenía la reserva.
    # **Si no se manda, no se chequea nada** — se distingue por
    # `model_fields_set`, porque `null` es un valor legítimo ("no tenía auto")
    # y no se puede usar como "no lo mandé".
    vehiculo_actual: int | None = None
    # Asignar y confirmar son lo mismo cuando la plata ya está: se deja
    # explícito para que la pantalla decida según lo que falte.
    confirmar: bool = False
    # D-54: opcional — si no se manda, el service arma un motivo genérico
    # ("Upgrade a categoría superior, mismo precio"). Sirve para que quien
    # asigna deje una nota puntual ("cliente frecuente", "el compacto se
    # rompió") en vez de perder el porqué de la cortesía.
    upgrade_motivo: str | None = None
    # D-65, ahora también acá: corregir el precio en el mismo paso. **No manda
    # nada por default** — sin esto, el precio queda como estaba, que es lo que
    # D-54 define para un upgrade. Sirve para el acuerdo distinto: un upgrade
    # que sí se cobra, o un downgrade que hay que compensar.
    precio_total: Decimal | None = Field(default=None, ge=0)
    # Obligatorio sólo si el precio cambia; lo valida el service, que es quien
    # conoce el precio anterior.
    precio_motivo: str | None = None


def _parse_conflicto(exc: ConflictError) -> dict:
    """Parsea el mensaje de ConflictError estructurado con | como separador."""
    parts = str(exc).split("|")
    code = parts[0] if parts else "error"
    message = parts[1] if len(parts) > 1 else str(exc)
    detail: dict = {"code": code, "message": message}

    if code == "solapamiento" and len(parts) >= 5:
        detail["conflicto"] = {
            "reserva_id": int(parts[2]) if parts[2].isdigit() else None,
            "estado": parts[3],
            "fecha_inicio": parts[4],
            "fecha_fin": parts[5] if len(parts) > 5 else "",
        }
    elif code == "solapamiento_extension" and len(parts) >= 6:
        detail["conflicto"] = {
            "reserva_id": int(parts[2]) if parts[2].isdigit() else None,
            "cliente_nombre": parts[3],
            "fecha_inicio": parts[4],
            "fecha_fin": parts[5],
        }
    return detail


# ─────────────────────────────────────────────────────────────────────────────
# CRUD Reservas
# ─────────────────────────────────────────────────────────────────────────────

@router.get("")
def list_reservas(
    estado: str | None = Query(None, description="Uno o varios separados por coma"),
    vehiculo_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    q: str | None = Query(None, description="Buscar por nombre o DNI/CUIT del cliente"),
    fecha: date | None = Query(None, description="Filtrar reservas activas en un día específico"),
    origen: str | None = Query(None, description="sistema | web — de dónde vino la reserva"),
    categoria_id: int | None = Query(None),
    contrato: str | None = Query(None, description="sin_emitir | emitido | sin_firmar"),
    fecha_desde: date | None = Query(None, description="Reservas que terminan a partir de esta fecha"),
    fecha_hasta: date | None = Query(None, description="Reservas que empiezan hasta esta fecha"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    items, total = svc.list(
        estado=estado,
        vehiculo_id=vehiculo_id,
        cliente_id=cliente_id,
        q=q,
        fecha=fecha,
        origen=origen,
        categoria_id=categoria_id,
        contrato=contrato,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        page=page,
        page_size=page_size,
    )
    return paginated(
        data=[ReservaResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_reserva(
    payload: ReservaCreate,
    db: Session = Depends(get_db),
    storage: IStorage = Depends(get_storage),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        reserva, warnings = svc.create(
            vehiculo_id=payload.vehiculo_id,
            categoria_id=payload.categoria_id,
            cliente_id=payload.cliente_id,
            conductor_id=payload.conductor_id,
            fecha_inicio=payload.fecha_inicio,
            hora_inicio=payload.hora_inicio,
            fecha_fin=payload.fecha_fin,
            hora_fin=payload.hora_fin,
            lugar_entrega=payload.lugar_entrega,
            lugar_devolucion=payload.lugar_devolucion,
            notas=payload.notas,
            hora_devolucion_acordada=payload.hora_devolucion_acordada,
            late_checkout=payload.late_checkout,
            cargo_late_checkout=payload.cargo_late_checkout,
            precio_total=payload.precio_total,
            adicionales=[(a.adicional_id, a.cantidad) for a in payload.adicionales],
            garantia_tipo=payload.garantia_tipo,
            garantia_monto=payload.garantia_monto,
            garantia_tarjeta_numero=payload.garantia_tarjeta_numero,
            garantia_tarjeta_vencimiento=payload.garantia_tarjeta_vencimiento,
            garantia_tarjeta_titular=payload.garantia_tarjeta_titular,
            forma_pago_prevista=payload.forma_pago_prevista,
            estado_pago=payload.estado_pago,
            anticipo_monto=payload.anticipo_monto,
            anticipo_fecha=payload.anticipo_fecha,
            anticipo_medio_pago=payload.anticipo_medio_pago,
            con_factura=payload.con_factura,
            descuento_motivo=payload.descuento_motivo,
            condicion_pago=payload.condicion_pago,
            condicion_pago_ancla=payload.condicion_pago_ancla,
            condicion_pago_fecha_ancla=payload.condicion_pago_fecha_ancla,
            tipo_factura=payload.tipo_factura,
            factura_a_nombre_de=payload.factura_a_nombre_de,
            echeq_banco=payload.echeq_banco,
            echeq_numero_cheque=payload.echeq_numero_cheque,
            echeq_fecha_cobro=payload.echeq_fecha_cobro,
            usuario_id=current_user.id,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    # PDF de confirmación archivado en el perfil del cliente. Va después del
    # commit y nunca hace fallar la reserva: si algo sale mal se registra y se
    # puede volver a pedir desde GET /reservas/{id}/pdf.
    db.refresh(reserva)
    doc = ReservaDocumentoService(db, storage).generar_y_archivar(reserva, current_user.id)
    if doc is not None:
        db.commit()

    # Y la confirmación al cliente, misma lógica: después del commit y sin
    # poder romper nada. Sólo sale si la reserva nació confirmada — a una
    # pendiente todavía no se le puede prometer un auto.
    EmailService.avisar(db, "reserva_confirmada", reserva)

    return ok(
        {
            **ReservaResponse.model_validate(reserva).model_dump(),
            "warnings": warnings,
        },
        "Reserva creada"
    )


@router.get("/{reserva_id}/pdf")
def descargar_pdf_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    storage: IStorage = Depends(get_storage),
    _: Usuario = Depends(get_current_user),
):
    """
    PDF de confirmación de la reserva. Se regenera al vuelo con los datos
    actuales — si la reserva se editó después de creada, el PDF refleja el
    estado de hoy, no el del momento del alta.
    """
    reserva = db.get(Reserva, reserva_id)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    contenido = ReservaDocumentoService(db, storage).generar(reserva)
    return Response(
        content=contenido,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="reserva-{reserva_id:05d}.pdf"'
        },
    )


@router.get("/a-reasignar")
def list_reservas_a_reasignar(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Vista D4: reservas de vehículos inactivos que necesitan reasignación."""
    svc = ReservaService(db)
    items = svc.get_reservas_a_reasignar()
    return ok([ReservaResponse.model_validate(r) for r in items])


@router.get("/pre-checkout-previo")
def pre_checkout_previo(
    cliente_id: int | None = None,
    conductor_id: int | None = None,
    vehiculo_id: int | None = None,
    garantia_tipo: str | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    El mismo semáforo de `/{reserva_id}/pre-checkout`, **sobre una reserva que
    todavía no existe**.

    El formulario de alta necesita mostrarlo en el resumen, antes de guardar,
    que es el único momento en que todavía se puede corregir. Como no hay
    `reserva_id`, hasta ahora el frontend armaba su propia lista de faltantes
    a mano — dos criterios que pueden divergir, que es justo lo que el resto
    del repo evita a propósito (ver el comentario de `hooks/usePrecios.ts`
    sobre no crear un segundo motor).

    No evalúa nada nuevo: llama a `evaluar_datos_pre_checkout`, del que
    `/{reserva_id}/pre-checkout` pasó a ser un caso particular.

    **Va declarado antes que `/{reserva_id}`**: si no, FastAPI intenta leer
    "pre-checkout-previo" como un id y devuelve 422.
    """
    from app.domain.bloqueos import evaluar_datos_pre_checkout
    from app.models.cliente import Cliente, ConductorAdicional
    from app.models.vehiculo import Vehiculo

    cliente = db.get(Cliente, cliente_id) if cliente_id else None
    conductor = db.get(ConductorAdicional, conductor_id) if conductor_id else None
    vehiculo = db.get(Vehiculo, vehiculo_id) if vehiculo_id else None

    semaforo, items = evaluar_datos_pre_checkout(
        db,
        vehiculo=vehiculo,
        cliente=cliente,
        conductor=conductor,
        garantia_tipo=garantia_tipo,
        # Al crear no puede haber solape marcado ni contrato: el solape se
        # detecta al guardar y se devuelve como warning, y el contrato no
        # existe hasta el check-out.
        bloqueada_por_solape=False,
        contrato_firmado=None,
    )
    return ok(SemaforoResponse(
        semaforo=semaforo,
        items=[BloqueoItemResponse(**i.__dict__) for i in items],
    ).model_dump())


@router.get("/{reserva_id}")
def get_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        reserva = svc.get(reserva_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(ReservaResponse.model_validate(reserva))


@router.get("/{reserva_id}/pre-checkout")
def pre_checkout(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Semáforo previo al check-out (Fase 3, ítem 39): adelanta lo que
    checkout() va a advertir/bloquear, sin tener que abrir el modal.
    Ver domain/bloqueos.py — la mayoría son advertencias informativas."""
    from app.domain.bloqueos import evaluar_pre_checkout

    svc = ReservaService(db)
    try:
        reserva = svc.get(reserva_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    semaforo, items = evaluar_pre_checkout(db, reserva)
    return ok(SemaforoResponse(semaforo=semaforo, items=[BloqueoItemResponse(**i.__dict__) for i in items]).model_dump())


@router.get("/{reserva_id}/pre-checkin")
def pre_checkin(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Semáforo previo al check-in (Fase 3, ítem 39). Requiere que la
    reserva ya tenga un alquiler (checkout hecho)."""
    from app.domain.bloqueos import evaluar_pre_checkin

    svc = ReservaService(db)
    try:
        reserva = svc.get(reserva_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not reserva.alquiler:
        raise HTTPException(status_code=422, detail="Esta reserva todavía no tiene checkout registrado")
    semaforo, items = evaluar_pre_checkin(db, reserva.alquiler)
    return ok(SemaforoResponse(semaforo=semaforo, items=[BloqueoItemResponse(**i.__dict__) for i in items]).model_dump())


@router.patch("/{reserva_id}")
def update_reserva(
    reserva_id: int,
    payload: ReservaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        datos = payload.model_dump(exclude_none=True)
        # `exclude_none` ya descartó `adicionales: None` ("no tocar"). Una
        # lista vacía sí llega, y significa "sacarlos todos".
        pedidos = datos.pop("adicionales", None)
        reserva, warnings = svc.update(
            id=reserva_id,
            usuario_id=current_user.id,
            adicionales=(
                [(a["adicional_id"], a["cantidad"]) for a in pedidos]
                if pedidos is not None else None
            ),
            **datos,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok(
        {**ReservaResponse.model_validate(reserva).model_dump(), "warnings": warnings},
        "Reserva actualizada",
    )


@router.post("/{reserva_id}/confirmar")
def confirmar_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    svc = ReservaService(db)
    try:
        reserva = svc.confirmar(reserva_id, current_user.id)
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    EmailService.avisar(db, "reserva_confirmada", reserva)
    return ok(ReservaResponse.model_validate(reserva), "Reserva confirmada")


@router.post("/{reserva_id}/cancelar")
def cancelar_reserva(
    reserva_id: int,
    payload: CancelarReservaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """D-11: la seña no se devuelve, motivo obligatorio."""
    svc = ReservaService(db)
    try:
        reserva = svc.cancelar(reserva_id, current_user.id, payload.motivo)
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ok(ReservaResponse.model_validate(reserva), "Reserva cancelada")


@router.get("/{reserva_id}/vehiculos-disponibles")
def vehiculos_disponibles(
    reserva_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Los autos que están **libres de verdad** en las fechas de esta reserva.

    Existe porque una reserva web llega por categoría (D-02) y hay que ponerle
    un auto concreto. Un desplegable con la flota entera obliga al operador a
    saberse de memoria qué está afuera, qué está en el taller y qué se
    devuelve tarde — y a los tres minutos alguien asigna un auto ocupado y el
    error aparece con el cliente enfrente.

    Se devuelven **todas** las categorías, no sólo la pedida: dar un upgrade
    es una decisión comercial válida y muchas veces la única forma de no
    perder la venta. Los de la categoría pedida van primero y marcados.

    Esto es una sugerencia, no una reserva: asignar revalida el auto elegido
    en ese momento (`ReservaService.asignar_vehiculo`).
    """
    from app.models.categoria import Categoria
    from app.models.vehiculo import Vehiculo
    from app.services.disponibilidad_service import DisponibilidadService

    reserva = db.get(Reserva, reserva_id)
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    libres_por_categoria = DisponibilidadService(db).unidades_libres(
        reserva.fecha_inicio, reserva.hora_inicio,
        reserva.fecha_fin, reserva.hora_fin,
        # La reserva no compite contra sí misma: si ya tenía un auto, ese
        # tiene que seguir figurando como elegible.
        excluir_reserva_id=reserva.id,
    )

    ids = [vid for lista in libres_por_categoria.values() for vid in lista]
    vehiculos = (
        db.query(Vehiculo).filter(Vehiculo.id.in_(ids)).all() if ids else []
    )
    categorias = db.query(Categoria).all()
    nombres = {c.id: c.nombre for c in categorias}
    ordenes = {c.id: c.orden for c in categorias}
    orden_pedido = ordenes.get(reserva.categoria_id) if reserva.categoria_id else None

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
                reserva.categoria_id is not None
                and v.categoria_id == reserva.categoria_id
            ),
            # D-54/checklist 56: mismo criterio que
            # `ReservaService.asignar_vehiculo` — se avisa ANTES de asignar,
            # no sólo se registra después. `False` cuando no hay con qué
            # comparar (sin categoría pedida u orden sin cargar), igual que
            # para la categoría pedida o un upgrade real.
            "es_downgrade": (
                orden_pedido is not None
                and v.categoria_id != reserva.categoria_id
                and ordenes.get(v.categoria_id) is not None
                and ordenes[v.categoria_id] < orden_pedido
            ),
        }
        for v in vehiculos
    ]
    # Primero la categoría pedida; dentro de cada grupo, por patente, que es
    # como el mostrador nombra a los autos.
    items.sort(key=lambda i: (not i["es_categoria_pedida"], i["patente"] or ""))

    return ok({
        "categoria_id": reserva.categoria_id,
        "categoria_nombre": nombres.get(reserva.categoria_id),
        "vehiculo_actual_id": reserva.vehiculo_id,
        "vehiculos": items,
    })


@router.post("/{reserva_id}/registrar-cobro")
def registrar_cobro(
    reserva_id: int,
    payload: RegistrarCobroRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Carga plata que ya entró por una reserva sin checkout y, por defecto, la
    confirma en el mismo paso.

    Es el camino de la reserva web por transferencia: no hay webhook que la
    confirme, así que la confirma la persona que vio la transferencia en el
    extracto. Cargar el monto y confirmar no son dos decisiones distintas.
    """
    svc = ReservaService(db)
    try:
        reserva = svc.registrar_cobro(
            reserva_id=reserva_id,
            monto=payload.monto,
            medio_pago=payload.medio_pago,
            usuario_id=current_user.id,
            fecha=payload.fecha,
            referencia=payload.referencia,
            confirmar=payload.confirmar,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok(ReservaResponse.model_validate(reserva), "Cobro registrado")


@router.post("/{reserva_id}/asignar-vehiculo")
def asignar_vehiculo(
    reserva_id: int,
    payload: AsignarVehiculoRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Le pone el auto concreto a una reserva por categoría.

    D-47: es el paso que habilita el contrato — hasta que no hay un auto no
    hay nada que firmar. La respuesta incluye `puede_emitir_contrato` para que
    la pantalla lo ofrezca ahí mismo en vez de mandar a otra.

    **Es el único camino para ponerle un auto a una reserva.** Había otros dos
    —`POST /reservas-web/{id}/aceptar`, borrado el 19/08, y `reasignar` (D4,
    para el vehículo dado de baja)— y las tres implementaciones habían
    derivado: sólo ésta toma el lock del auto, registra el upgrade de D-54 y
    deja auditoría.
    """
    svc = ReservaService(db)
    try:
        reserva, warnings = svc.asignar_vehiculo(
            reserva_id=reserva_id,
            vehiculo_id=payload.vehiculo_id,
            usuario_id=current_user.id,
            confirmar=payload.confirmar,
            upgrade_motivo=payload.upgrade_motivo,
            precio_total=payload.precio_total,
            precio_motivo=payload.precio_motivo,
            vehiculo_esperado=(
                payload.vehiculo_actual
                if "vehiculo_actual" in payload.model_fields_set
                else ReservaService.SIN_CHEQUEO
            ),
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BusinessRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ok(
        {
            **ReservaResponse.model_validate(reserva).model_dump(),
            # `contrato_estado` sale de la reserva y ya contempla el caso: una
            # reserva sin auto devuelve "no_aplica". Con auto y confirmada
            # pasa a "sin_emitir", que es lo que la pantalla usa para ofrecer
            # el botón sin tener que replicar la regla.
            "puede_emitir_contrato": reserva.contrato_estado == "sin_emitir",
            # D-48: si al cambiar el auto se anuló un contrato firmado, el
            # operador tiene que enterarse **ahora** y no cuando el cliente
            # llega con un papel que nombra otra patente.
            "warnings": warnings,
        },
        "Vehículo asignado",
    )


@router.post("/{reserva_id}/reasignar")
def reasignar_reserva(
    reserva_id: int,
    payload: ReasignarRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """D4: Reasigna una reserva a otro vehículo."""
    svc = ReservaService(db)
    try:
        reserva, warnings = svc.reasignar(
            reserva_id,
            payload.vehiculo_id_nuevo,
            current_user.id,
            precio_total=payload.precio_total,
            precio_motivo=payload.precio_motivo,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ok(
        {**ReservaResponse.model_validate(reserva).model_dump(), "warnings": warnings},
        "Reserva reasignada",
    )


@router.post("/{reserva_id}/checkout", status_code=status.HTTP_201_CREATED)
def checkout(
    reserva_id: int,
    payload: CheckoutCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Inicia el checkout de una reserva confirmada."""
    svc = AlquilerService(db)
    try:
        alquiler, warnings = svc.checkout(
            reserva_id=reserva_id,
            checkout_fecha=payload.checkout_fecha,
            checkout_hora=payload.checkout_hora,
            checkout_km=payload.checkout_km,
            checkout_combustible=payload.checkout_combustible,
            checkout_descripcion=payload.checkout_descripcion,
            usuario_id=current_user.id,
            registrado_en_tiempo_real=payload.registrado_en_tiempo_real,
            checkout_estado_limpieza=payload.checkout_estado_limpieza,
            garantia_tipo=payload.garantia_tipo,
            garantia_monto=payload.garantia_monto,
            pago_inmediato=payload.pago_inmediato,
            cargo_checkout_tardio=payload.cargo_checkout_tardio,
            motivo_checkout_tardio=payload.motivo_checkout_tardio,
            motivo_sin_contrato=payload.motivo_sin_contrato,
        )
        db.commit()
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=_parse_conflicto(e))
    except (NotFoundError, BusinessRuleError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    # La constancia de entrega al cliente. Después del commit: el auto ya
    # salió, y ninguna falla de Resend puede devolver un error acá.
    EmailService.avisar(db, "checkout", alquiler)

    return ok(
        {**AlquilerResponse.model_validate(alquiler).model_dump(), "warnings": warnings},
        "Checkout registrado",
    )
