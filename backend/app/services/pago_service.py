"""
Registrar un cobro suelto. Un solo lugar.

**Por qué existe.** Esto vivía entero adentro de `POST /pagos`
(`routers/pagos.py::create_pago`). El tablero de Uber necesita cobrar la semana
de un chofer con un clic, y la única forma de garantizar que ese cobro aparezca
en Caja, en Cobros y en la cuenta corriente **exactamente igual** que uno
cargado a mano es que los dos pasen por la misma función. Copiar las veinte
líneas habría sido una segunda caja, que es lo que el `PLAN_DINERO.md` se pasó
siete fases eliminando.

No hace `commit()`: lo decide quien llama, igual que el resto de los services.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.alquiler import Alquiler
from app.models.pago import Pago
from app.models.reserva import Reserva
from app.schemas.pago import PagoCreate
from app.services.caja_service import es_plata_que_entro
from app.services.cuenta_corriente_service import CuentaCorrienteService


def registrar_pago(
    db: Session,
    payload: PagoCreate,
    usuario_id: int,
    *,
    concepto: str | None = None,
) -> Pago:
    """
    Crea el `Pago` y el crédito que le corresponde en la cuenta corriente.

    `concepto` es el texto del asiento; sin él queda el de siempre ("Cobro
    alquiler #N (medio)"). Lo usa el tablero de Uber para que la cuenta
    corriente diga qué semana se cobró.

    Levanta `NotFoundError` si el alquiler no existe y `ValueError` si no hay a
    quién cobrarle.
    """
    # Desde la migración 043 un pago puede no tener alquiler (pago a cuenta,
    # seña de una reserva sin alquiler todavía, cancelación de deuda vieja).
    # Lo que no puede faltar es el cliente: siempre se le cobra a alguien.
    cliente_id = payload.cliente_id
    if payload.alquiler_id is not None:
        alquiler = db.query(Alquiler).filter(Alquiler.id == payload.alquiler_id).first()
        if not alquiler:
            raise NotFoundError("Alquiler", payload.alquiler_id)
        reserva = db.get(Reserva, alquiler.reserva_id)
        if reserva:
            cliente_id = cliente_id or reserva.cliente_id

    if cliente_id is None:
        raise ValueError("El pago necesita un cliente, o un alquiler del que deducirlo")

    pago = Pago(
        **payload.model_dump(exclude={"cliente_id"}),
        cliente_id=cliente_id,
        cobrado_por=usuario_id,
    )
    db.add(pago)
    db.flush()  # asegurar pago.id antes de enlazarlo al movimiento

    # Ledger completo: todo alquiler factura un débito automático en el
    # checkout (ver AlquilerService.checkout). Cualquier cobro posterior,
    # sea cual sea el medio de pago, genera el CRÉDITO que lo cancela.
    if concepto is None:
        concepto = (
            f"Cobro alquiler #{payload.alquiler_id} ({payload.medio_pago})"
            if payload.alquiler_id is not None
            else f"Cobro a cuenta ({payload.medio_pago})"
        )
    # `cuenta_corriente` no cancela la deuda: significa "se lo anotamos en la
    # cuenta", o sea que la plata no entró. El `Pago` queda como constancia de
    # la decisión; el saldo, sin tocar. Ver `caja_service.es_plata_que_entro`.
    if es_plata_que_entro(payload.medio_pago):
        CuentaCorrienteService(db).registrar_movimiento(
            cliente_id=cliente_id,
            tipo="credito",
            # Un cobro suelto siempre es contra una deuda que ya existe: es un
            # `pago`, no un `anticipo`. La seña de una reserva sin alquiler entra
            # por `ReservaService.registrar_cobro`, que sí la asienta como anticipo.
            naturaleza="pago",
            concepto=concepto,
            monto=Decimal(str(payload.monto)),
            fecha=payload.fecha,
            creado_por=usuario_id,
            alquiler_id=payload.alquiler_id,
            pago_id=pago.id,
        )
    return pago
