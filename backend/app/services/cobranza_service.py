"""
Cuánto falta cobrar. Un solo lugar.

**Por qué existe.** "El saldo pendiente de este alquiler" estaba escrito dos
veces —`routers/pagos.py` (pendientes de caja) y
`domain/notificaciones_reglas.py` (aviso de saldo al finalizar)— con la misma
fórmula copiada. Cuando la fórmula tenía un error, lo tenía en los dos lados, y
arreglar uno dejaba al otro contradiciéndolo. Es exactamente el problema que
`PLAN_DINERO.md` §1.5.a y §3.3b describen.

**Qué contesta, y qué no.** Contesta *cuánto falta cobrar de este alquiler*
—comparando lo facturado contra los `Pago` que le entraron— y por extensión
*qué alquileres tienen algo pendiente*. **No** hace imputación
crédito→débito: no sabe *qué* asiento está impago, sólo cuánto falta. Esa
limitación está asumida y documentada en `PLAN_DINERO.md` §4.3.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.alquiler import Alquiler
from app.models.cuenta_corriente import CuentaCorriente
from app.models.reserva import Reserva


def monto_facturado(alquiler: Alquiler) -> Decimal:
    """
    Todo lo que el alquiler le factura al cliente.

    Es la misma suma que asienta el débito del check-out
    (`AlquilerService.checkout`) más lo que se agrega al cerrar: el excedente
    decidido en el check-in. Los adicionales viven fuera de `precio_total`
    (ver `Reserva.total_adicionales`) y por eso se suman aparte.
    """
    reserva = alquiler.reserva
    if reserva is None:
        return Decimal("0")
    return (
        Decimal(str(reserva.precio_total or 0))
        + Decimal(str(reserva.cargo_late_checkout or 0))
        + Decimal(str(alquiler.cargo_excedente or 0))
        + Decimal(str(reserva.total_adicionales))
    )


def monto_cobrado(alquiler: Alquiler) -> Decimal:
    """Lo que efectivamente entró por este alquiler."""
    return sum((Decimal(str(p.monto)) for p in alquiler.pagos), Decimal("0"))


def saldo_pendiente(alquiler: Alquiler) -> Decimal:
    """Lo facturado menos lo cobrado. Puede dar negativo (se cobró de más)."""
    return monto_facturado(alquiler) - monto_cobrado(alquiler)


def alquileres_con_saldo_pendiente(db: Session) -> set[int]:
    """
    Los ids de los alquileres a los que todavía les falta plata.

    **Es el filtro que apaga la falsa "deuda vencida"** (`PLAN_DINERO.md`
    §1.1 y §4.3): un alquiler al contado cobrado íntegro en el mostrador no
    entra acá, así que su débito —que vence el mismo día, por definición de
    "contado"— deja de generar avisos para siempre.
    """
    alquileres = db.query(Alquiler).join(Reserva, Reserva.id == Alquiler.reserva_id).all()
    return {a.id for a in alquileres if saldo_pendiente(a) > 0}


def clientes_con_deuda(db: Session) -> set[int]:
    """
    Los ids de los clientes cuya cuenta corriente tiene deuda real.

    Es el filtro de respaldo para los movimientos que **no cuelgan de ningún
    alquiler** —multas y daños imputados sueltos, movimientos manuales—, donde
    no hay un alquiler contra el que preguntar. Ahí alcanza: son pocos y no
    tienen la contrapartida automática que genera el ruido.

    "Deuda" y no "saldo": un crédito por una reserva que todavía no salió es un
    anticipo, no plata a favor del cliente. Ver `CuentaCorrienteService.desglose`.
    """
    # Import local: `CuentaCorrienteService` importa modelos que a su vez
    # importan este módulo en el árbol de servicios.
    from app.services.cuenta_corriente_service import CuentaCorrienteService

    svc = CuentaCorrienteService(db)
    con_deuda = set()
    for (cliente_id,) in db.query(CuentaCorriente.cliente_id).all():
        if svc.desglose(cliente_id)["deuda"] > 0:
            con_deuda.add(cliente_id)
    return con_deuda
