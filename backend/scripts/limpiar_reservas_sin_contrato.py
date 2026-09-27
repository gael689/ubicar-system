"""
Cancela —no borra— las reservas que quedaron colgadas sin contrato ni alquiler.

    *"Limpiar toda reserva sin contrato"* — pedido del 27/09/2026

Uso:

    python -m scripts.limpiar_reservas_sin_contrato                 # dry-run: sólo lista
    python -m scripts.limpiar_reservas_sin_contrato --confirmar     # cancela de verdad
    python -m scripts.limpiar_reservas_sin_contrato --dias-web 14   # antigüedad de las web

Contra producción se corre adentro del contenedor, igual que
`reset_datos_operativos.py`:

    railway ssh --service ubicar-system "cd /app && python -m scripts.limpiar_reservas_sin_contrato"

**Qué es una reserva colgada.** No tiene `Alquiler` (el auto nunca salió) ni
ningún contrato sin anular, y además:

  (a) está `pendiente`, `confirmada`, `activa` o `vencida` y su devolución ya
      pasó (`fecha_fin < hoy`): es una entrega que nunca ocurrió y que sigue
      ocupando el calendario. `activa`/`vencida` sin alquiler son las que
      fabricaba el reloj viejo (ver migración 100); o
  (b) es una reserva web `pendiente_pago`, `sin_disponibilidad` o
      `revision_sin_cupo` creada hace más de `--dias-web` días (7 por
      defecto): nadie la va a retomar.

**Las que tienen plata no se tocan.** Si hay un pago sin anular, un pago web
aprobado, movimientos de cuenta corriente, echeqs, movimientos de caja o una
seña anotada en la reserva, se listan aparte para que las resuelva una
persona: cancelar una reserva con plata adentro sin devolverla ni aplicarla
deja al cliente con un crédito que nadie ve.

**Qué hace con cada una** (sólo con `--confirmar`, todo en una transacción):
`estado = cancelada` con el motivo "Limpieza: reserva sin contrato", deja
constancia en la auditoría, resuelve sus notificaciones y libera el hold de la
web si quedaba uno. Nunca un DELETE: la reserva sigue en la base, cancelada.

**Dry-run por default a propósito**, como el reset: esto toca la base real.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.models.alquiler import Alquiler
from app.models.contrato import Contrato
from app.models.cuenta_corriente import MovimientoCuentaCorriente
from app.models.echeq import Echeq
from app.models.hold import Hold
from app.models.movimiento_caja import MovimientoCaja
from app.models.pago import Pago
from app.models.pago_web import PagoWeb
from app.models.reserva import Reserva

MOTIVO = "Limpieza: reserva sin contrato"
DIAS_WEB_POR_DEFECTO = 7

ESTADOS_TERMINADAS = ("pendiente", "confirmada", "activa", "vencida")
ESTADOS_WEB_COLGADAS = ("pendiente_pago", "sin_disponibilidad", "revision_sin_cupo")


@dataclass
class Seleccion:
    a_cancelar: list[Reserva] = field(default_factory=list)
    # (reserva, qué plata tiene) — no se tocan, las resuelve una persona.
    con_plata: list[tuple[Reserva, list[str]]] = field(default_factory=list)


def _plata_asociada(db: Session, reserva: Reserva) -> list[str]:
    """Qué plata cuelga de la reserva. Vacío = se puede cancelar sin más."""
    rid = reserva.id
    motivos = []
    if db.query(exists().where(Pago.reserva_id == rid, Pago.anulado.is_(False))).scalar():
        motivos.append("pagos")
    if db.query(exists().where(PagoWeb.reserva_id == rid, PagoWeb.estado == "aprobado")).scalar():
        motivos.append("pago web aprobado")
    if db.query(exists().where(MovimientoCuentaCorriente.reserva_id == rid)).scalar():
        motivos.append("cuenta corriente")
    if db.query(exists().where(Echeq.reserva_id == rid)).scalar():
        motivos.append("echeqs")
    if db.query(exists().where(MovimientoCaja.reserva_id == rid, MovimientoCaja.anulado.is_(False))).scalar():
        motivos.append("movimientos de caja")
    # La seña anotada a mano en la reserva, sin un Pago detrás (el camino
    # viejo de "Cobros pendientes"): no hay asiento, pero alguien dijo que
    # entró plata. Mejor que lo mire una persona.
    if reserva.anticipo_monto and reserva.anticipo_monto > 0:
        motivos.append("seña anotada en la reserva")
    return motivos


def seleccionar(db: Session, hoy: date, dias_web: int = DIAS_WEB_POR_DEFECTO) -> Seleccion:
    """
    Las reservas colgadas, separadas entre las que se pueden cancelar y las que
    tienen plata. No escribe nada.
    """
    sin_alquiler = ~exists().where(Alquiler.reserva_id == Reserva.id)
    sin_contrato = ~exists().where(Contrato.reserva_id == Reserva.id, Contrato.anulado.is_(False))
    limite_web = datetime.combine(hoy - timedelta(days=dias_web), datetime.min.time())

    candidatas = (
        db.query(Reserva)
        .filter(
            sin_alquiler,
            sin_contrato,
            (Reserva.estado.in_(ESTADOS_TERMINADAS) & (Reserva.fecha_fin < hoy))
            | (Reserva.estado.in_(ESTADOS_WEB_COLGADAS) & (Reserva.created_at < limite_web)),
        )
        .order_by(Reserva.fecha_inicio, Reserva.id)
        .all()
    )

    sel = Seleccion()
    for r in candidatas:
        plata = _plata_asociada(db, r)
        if plata:
            sel.con_plata.append((r, plata))
        else:
            sel.a_cancelar.append(r)
    return sel


def cancelar(db: Session, reservas: list[Reserva]) -> int:
    """Cancela las reservas elegidas. No hace commit: lo hace quien llama."""
    from app.services import auditoria_service
    from app.services.notificacion_service import NotificacionService

    notificaciones = NotificacionService(db)
    for r in reservas:
        antes = r.estado
        r.estado = "cancelada"
        r.motivo_cancelacion = MOTIVO
        # El hold de la web, si quedó vigente, deja de sostener cupo.
        db.query(Hold).filter(Hold.reserva_id == r.id, Hold.estado == "vigente").update(
            {"estado": "liberado"}, synchronize_session=False
        )
        notificaciones.resolver_por_entidad("reserva", r.id)
        auditoria_service.registrar(
            db,
            usuario_id=None,
            accion="cancelar_reserva",
            entidad_tipo="reserva",
            entidad_id=r.id,
            descripcion=f"Reserva #{r.id} cancelada por la limpieza de reservas sin contrato (estaba {antes})",
            datos_antes={"estado": antes},
            datos_despues={"estado": "cancelada", "motivo_cancelacion": MOTIVO},
        )
    db.flush()
    return len(reservas)


def _linea(r: Reserva) -> str:
    quien = r.web_contacto_nombre or (r.cliente.nombre_completo if r.cliente else "?")
    return (
        f"  #{r.id:<6} {r.estado:<18} {r.fecha_inicio.strftime('%d/%m/%Y')} al "
        f"{r.fecha_fin.strftime('%d/%m/%Y')}  {r.origen or '':<9} {quien}"
    )


def _imprimir(sel: Seleccion) -> None:
    print(f"Reservas sin contrato ni alquiler para cancelar: {len(sel.a_cancelar)}")
    for r in sel.a_cancelar:
        print(_linea(r))
    print(f"\nCon plata asociada — NO se tocan, resolver a mano: {len(sel.con_plata)}")
    for r, plata in sel.con_plata:
        print(_linea(r) + f"   [{', '.join(plata)}]")


def main() -> None:
    from app.database import SessionLocal, engine

    args = sys.argv[1:]
    confirmar = "--confirmar" in args
    dias_web = DIAS_WEB_POR_DEFECTO
    if "--dias-web" in args:
        i = args.index("--dias-web")
        try:
            dias_web = int(args[i + 1])
        except (IndexError, ValueError):
            print("--dias-web necesita un número de días")
            sys.exit(2)
        del args[i:i + 2]
    # Un flag mal escrito no puede pasar por "no lo pediste".
    desconocidos = [a for a in args if a != "--confirmar"]
    if desconocidos:
        print(f"Flag desconocido: {' '.join(desconocidos)}")
        print("Los que existen: --confirmar --dias-web N")
        sys.exit(2)

    db = SessionLocal()
    try:
        print(f"Contra: {engine.url.render_as_string(hide_password=True)}")
        print(f"Web colgadas: creadas hace más de {dias_web} día(s)\n")
        sel = seleccionar(db, date.today(), dias_web)
        _imprimir(sel)
        if not confirmar:
            print("\nDRY-RUN: no se cambió nada. Para cancelar de verdad: --confirmar")
            return
        n = cancelar(db, sel.a_cancelar)
        db.commit()
        print(f"\nCanceladas: {n}. Ninguna se borró.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
