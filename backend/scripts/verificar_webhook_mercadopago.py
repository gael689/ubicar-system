"""
Verifica los seis caminos del webhook de Mercado Pago contra la base real.

**Por qué existe como script y no como test.** Mismo motivo que
`verificar_concurrencia`: la suite de `tests/` es de dominio puro y corre en
segundos sin base. Lo que se prueba acá no es la tabla de decisión —eso ya
está en `tests/domain/test_pagos_web.py`— sino que el service **escriba lo que
tiene que escribir**: el asiento en la cuenta corriente, el estado de la
reserva, el cierre del hold. Nada de eso existe sin Postgres.

Son los caminos que la API real casi nunca produce a pedido, y los que más
caro salen si están mal: un pago duplicado que genera dos asientos, un monto
manipulado que confirma igual, una reserva que se confirma sin auto.

    python -m scripts.verificar_webhook_mercadopago

**No deja nada en la base.** `Session.commit` se reemplaza por `flush`
mientras dura la verificación —`procesar_webhook` commitea adentro— y al final
se hace rollback. Las tarifas que necesita para cotizar también se crean
dentro de esa transacción, así que el script no depende de cómo esté cargada
la base ni la ensucia.

Usa `PasarelaFake`, así que no habla con Mercado Pago ni mueve un peso.
"""
from __future__ import annotations

import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import text

from app.adapters.pagos.fake import PasarelaFake
from app.database import SessionLocal
from app.models.hold import Hold
from app.models.pago import Pago
from app.models.pago_web import PagoWeb
from app.models.reserva import Reserva
from app.models.tarifa import Tarifa
from app.services.hold_service import HoldService
from app.services.pago_web_service import PagoWebService

# Categoría con varias unidades (para los casos donde el cupo sobra) y
# categoría con una sola (para el caso donde se agota). Se leen de la base:
# fijarlas por id haría que el script mienta si cambia la flota.
MONTO_DIA = Decimal("20")

fallos: list[str] = []

# **Una sola pasarela para todos los escenarios.** Cada `PasarelaFake` nueva
# reinicia su contador en 1, y con los `payment_id` repetidos un escenario
# encuentra el `PagoWeb` del anterior y todo pasa en verde por el motivo
# equivocado. Costó un rato descubrirlo.
FAKE = PasarelaFake(estado_por_defecto="approved")


def chequear(etiqueta: str, obtenido, esperado) -> None:
    bien = obtenido == esperado
    print(f"  {'[ok] ' if bien else '[MAL]'} {etiqueta:<44} {obtenido!r}")
    if not bien:
        fallos.append(f"{etiqueta}: esperaba {esperado!r}, vino {obtenido!r}")


def asientos_de(db, reserva_id: int) -> int:
    return db.execute(
        text("SELECT count(*) FROM movimientos_cuenta_corriente WHERE reserva_id = :r"),
        {"r": reserva_id},
    ).scalar()


def categorias_para_probar(db) -> tuple[int, int]:
    """
    (categoría con cupo de sobra, categoría de una sola unidad).

    Salen de contar vehículos activos, no de ids fijos.
    """
    filas = db.execute(text("""
        SELECT categoria_id, count(*) AS unidades
        FROM vehiculos WHERE activo = true AND categoria_id IS NOT NULL
        GROUP BY categoria_id ORDER BY unidades DESC
    """)).all()
    if not filas:
        sys.exit("No hay vehículos activos: no se puede verificar nada.")
    holgada = filas[0][0]
    escasa = next((c for c, u in filas if u == 1), None)
    if escasa is None:
        sys.exit("Hace falta una categoría con UNA sola unidad para el caso sin cupo.")
    return holgada, escasa


def armar(db, svc, categoria: int, dias_adelante: int, porcentaje: int = 100):
    """Un checkout listo para recibir el webhook."""
    inicio = date.today() + timedelta(days=dias_adelante)
    hold = HoldService(db).crear(
        categoria_id=categoria, fecha_inicio=inicio, hora_inicio=time(10, 0),
        fecha_fin=inicio + timedelta(days=1), hora_fin=time(10, 0),
    )
    db.flush()
    resultado = svc.iniciar_checkout(
        hold_token=hold.token, nombre="Verificación Webhook",
        email="verificacion@ejemplo.com", telefono="2914180554", dni="40999888",
        lugar_entrega="Paraguay 241", lugar_devolucion=None,
        porcentaje_anticipo=porcentaje, fecha_nacimiento=date(1995, 1, 1),
        url_base_web="https://ubicar-rent.com.ar", url_webhook="https://ejemplo/webhook",
    )
    return hold, resultado


def main() -> int:
    db = SessionLocal()
    db.commit = db.flush          # el commit de procesar_webhook no persiste
    try:
        holgada, escasa = categorias_para_probar(db)
        for categoria in (holgada, escasa):
            db.add(Tarifa(categoria_id=categoria, tipo="diaria", monto=MONTO_DIA,
                          activo=True, vigencia_desde=date(2020, 1, 1),
                          es_generica=False))
        db.flush()
        svc = PagoWebService(db)
        svc._pasarela = FAKE

        # ── 1 ───────────────────────────────────────────────────────────────
        print("\n1. PAGO APROBADO CON CUPO")
        _, r = armar(db, svc, holgada, 15)
        res = svc.procesar_webhook(FAKE.ultimo_payment_id())
        reserva = db.get(Reserva, r["reserva_id"])
        chequear("resultado", res["resultado"], "procesado")
        chequear("estado de la reserva", reserva.estado, "confirmada")
        chequear("estado de pago", reserva.estado_pago, "pagado")
        chequear("medio del anticipo", reserva.anticipo_medio_pago, "mercado_pago")
        chequear("asientos en cuenta corriente", asientos_de(db, reserva.id), 1)
        pago = (db.query(Pago).filter(Pago.cliente_id == reserva.cliente_id)
                  .order_by(Pago.id.desc()).first())
        chequear("medio del cobro", pago.medio_pago, "mercado_pago")
        chequear("monto del cobro", pago.monto, MONTO_DIA.quantize(Decimal("0.01")))

        # ── 2 ───────────────────────────────────────────────────────────────
        # Mercado Pago reintenta: es su comportamiento normal, no un error.
        print("\n2. EL MISMO WEBHOOK OTRA VEZ")
        chequear("resultado", svc.procesar_webhook(FAKE.ultimo_payment_id())["resultado"],
                 "duplicado")
        chequear("asientos (no puede haber dos)", asientos_de(db, reserva.id), 1)

        # ── 3 ───────────────────────────────────────────────────────────────
        # Los webhooks llegan desordenados. Un `pending` tardío no puede
        # desconfirmar una reserva ya cobrada.
        print("\n3. UN 'PENDING' QUE ATERRIZA DESPUÉS DEL 'APPROVED'")
        FAKE.forzar_estado(FAKE.ultimo_payment_id(), "pending")
        chequear("resultado", svc.procesar_webhook(FAKE.ultimo_payment_id())["resultado"],
                 "duplicado")
        chequear("sigue confirmada", db.get(Reserva, reserva.id).estado, "confirmada")

        # ── 4 ───────────────────────────────────────────────────────────────
        print("\n4. PAGO RECHAZADO")
        hold4, r4 = armar(db, svc, holgada, 16)
        pid4 = FAKE.ultimo_payment_id()
        FAKE.forzar_estado(pid4, "rejected")
        svc.procesar_webhook(pid4)
        chequear("estado de la reserva", db.get(Reserva, r4["reserva_id"]).estado, "cancelada")
        chequear("asientos (no entró plata)", asientos_de(db, r4["reserva_id"]), 0)
        chequear("el hold se liberó",
                 db.query(Hold).filter(Hold.token == hold4.token).first().estado, "liberado")

        # ── 5 ───────────────────────────────────────────────────────────────
        # Regla 4 de §6: el monto se compara contra lo que pedimos.
        print("\n5. EL MONTO ACREDITADO NO ES EL QUE SE PIDIÓ")
        _, r5 = armar(db, svc, holgada, 17)
        pid5 = FAKE.ultimo_payment_id()
        FAKE.forzar_monto(pid5, Decimal("1.00"))
        res5 = svc.procesar_webhook(pid5)
        chequear("resultado", res5["resultado"], "revision")
        chequear("no se confirmó", db.get(Reserva, r5["reserva_id"]).estado != "confirmada", True)
        chequear("asientos (no se acredita)", asientos_de(db, r5["reserva_id"]), 0)
        print(f"        detalle -> {db.get(PagoWeb, r5['pago_web_id']).detalle}")

        # ── 6 ───────────────────────────────────────────────────────────────
        # El caso que cuesta plata de verdad. **Que el hold venza no alcanza
        # para provocarlo**: la regla re-verifica *cupo*, no *hold*, así que
        # mientras quede un auto libre confirmar es lo correcto. Hace falta
        # agotar la categoría, y por eso el script busca una de una unidad.
        #
        # La secuencia es la real: A abre el checkout, se le vence el hold, B
        # se lleva el único auto, y recién entonces aterriza el pago de A.
        print("\n6. PAGO APROBADO CUANDO YA NO QUEDA AUTO")
        holdA, rA = armar(db, svc, escasa, 25)
        pidA = FAKE.ultimo_payment_id()
        db.query(Hold).filter(Hold.token == holdA.token).first().expira_en = (
            datetime.utcnow() - timedelta(hours=1))
        db.flush()

        _, rB = armar(db, svc, escasa, 25)
        svc.procesar_webhook(FAKE.ultimo_payment_id())
        chequear("B se quedó con la unidad",
                 db.get(Reserva, rB["reserva_id"]).estado, "confirmada")

        resA = svc.procesar_webhook(pidA)
        chequear("requiere que lo mire una persona", resA.get("requiere_persona"), True)
        chequear("la plata de A se acredita igual", asientos_de(db, rA["reserva_id"]), 1)
        chequear("A no se confirma sola",
                 db.get(Reserva, rA["reserva_id"]).estado, "revision_sin_cupo")
        print(f"        detalle -> {db.get(PagoWeb, rA['pago_web_id']).detalle}")
    finally:
        db.rollback()
        db.close()

    print("\n" + "=" * 64)
    if fallos:
        print(f"FALLARON {len(fallos)}:")
        for f in fallos:
            print("  -", f)
        return 1
    print("Los seis caminos hacen lo que tienen que hacer.")
    print("La base quedó como estaba (rollback).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
