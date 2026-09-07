"""La seña que se declara al crear la reserva también es un cobro

**El síntoma que lo destapó.** Se carga una reserva de $160.000 marcando "abonó el
total", se entrega el auto, y al registrar la devolución la pantalla dice:

    Precio alquiler      $160.000
    Anticipo pagado     -$160.000
    Saldo base pendiente $160.000

**Por qué pasa.** `ReservaService.create()` escribe `Reserva.anticipo_monto` y
nada más: no crea el `Pago` ni el crédito en la cuenta corriente. Y todo lo que
contesta "¿cuánto falta cobrar?" mira los `Pago`
(`cobranza_service.monto_cobrado`), no ese campo. Con cero pagos, el saldo es el
total. El `-$160.000` de la pantalla salía de leer `anticipo_monto` directo, así
que las dos líneas del resumen venían de dos fuentes distintas y se contradecían.

La Fase 2 del `PLAN_DINERO.md` unificó esto para las cuatro puertas que su §2.6
lista —mostrador, transferencia, Mercado Pago y check-out—, y todas asientan su
`Pago` y su crédito `anticipo` en el momento en que entra la plata. **El alta de
la reserva es una quinta puerta que la tabla nunca listó**, y quedó afuera.

Además de la pantalla, esto rompía tres cosas más: la plata no estaba en la caja
del día en que entró; la cuenta corriente del cliente mostraba la deuda inflada
por el importe de la seña; y `alquileres_con_saldo_pendiente` seguía reclamando
para siempre un alquiler ya cobrado.

**Qué repara esta migración.** Sólo las reservas que quedaron huérfanas: con
`anticipo_monto > 0` y **sin ningún** `Pago` ni crédito propio. Si algo ya tiene
su asiento, no se toca. Por eso es idempotente: correrla dos veces no encuentra
nada la segunda.

**Las canceladas quedan afuera.** `ReservaService.cancelar` ya tiene su propio
camino para la seña retenida o devuelta (D-11), con su débito y su crédito.
Meterle un `Pago` ahora movería la caja de un día pasado por una operación que ya
está cerrada.

**El echeq queda afuera del crédito, no del `Pago`.** Un echeq recibido ya asienta
su crédito con naturaleza `echeq_en_cartera` desde `EcheqService.crear_recibido`,
y esa distinción importa: un cheque es un papel que puede rebotar, no plata.
Duplicarlo como `anticipo` haría que el check-out lo marcara aplicado como si
fuera una seña cobrada. Mismo criterio con `cuenta_corriente`, que significa "se
lo anotamos" — ver `caja_service.es_plata_que_entro`.

**SQL crudo y no los services.** Una migración tiene que poder replayearse dentro
de dos años contra un esquema que ya no es el de hoy; importar los modelos la ata
a la forma que tengan las clases en ese momento. Las invariantes del ledger
(`saldo_posterior` encadenado, el saldo de la cuenta, la aplicación del anticipo)
se replican acá explícitas, que además las deja a la vista.

Revision ID: 093_sena_del_alta
Revises: 092_devolucion_con_fecha
"""
from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from alembic import op

revision = "093_sena_del_alta"
down_revision = "092_devolucion_con_fecha"
branch_labels = None
depends_on = None


# La marca que deja el rastro en el `Pago`. Es lo que permite que `downgrade()`
# saque exactamente lo que esta migración puso y nada más.
MARCA = "[093] Seña declarada al crear la reserva"

# Los valores que el enum `medio_pago` de `pagos` acepta.
# `Reserva.anticipo_medio_pago` es texto libre (String(30)), así que puede traer
# cualquier cosa —o nada— y un INSERT con un valor fuera del enum voltea la
# migración entera y con ella el deploy.
MEDIOS_VALIDOS = {
    "efectivo", "transferencia", "tarjeta", "cheque", "echeq",
    "cuenta_corriente", "mercado_pago", "wapa",
}

# Los que no son plata que entró: el `Pago` se crea igual (constancia y caja),
# pero no generan el crédito de naturaleza `anticipo`.
#   - `cuenta_corriente` no es un cobro, es "se lo anotamos en la cuenta".
#   - `echeq` ya tiene su propio crédito `echeq_en_cartera`.
SIN_CREDITO_ANTICIPO = {"cuenta_corriente", "echeq"}

# Los importes se declaran con su tipo en vez de dejarlos como parámetro suelto.
#
# **No es ceremonia.** El driver de SQLite rechaza un `Decimal` crudo
# (`type 'decimal.Decimal' is not supported`) y el de Postgres lo acepta, así
# que sin esto la migración anda en producción y revienta en cualquier base
# SQLite — la de desarrollo, entre otras. Con el tipo declarado, SQLAlchemy lo
# adapta al dialecto que haya, y el importe no pasa por `float` en el camino.
_MONTO = sa.Numeric(12, 2)


def _tipando_montos(sql: str, *nombres: str):
    """`sa.text(sql)` con los parámetros de plata declarados como `Numeric`."""
    return sa.text(sql).bindparams(
        *(sa.bindparam(n, type_=_MONTO) for n in nombres)
    )


def upgrade() -> None:
    bind = op.get_bind()
    ahora = datetime.utcnow()

    huerfanas = bind.execute(sa.text("""
        SELECT r.id, r.cliente_id, r.usuario_id, r.anticipo_monto,
               r.anticipo_fecha, r.anticipo_medio_pago, r.created_at
          FROM reservas r
         WHERE r.anticipo_monto IS NOT NULL
           AND r.anticipo_monto > 0
           AND r.estado <> 'cancelada'
           AND NOT EXISTS (
                 SELECT 1 FROM pagos p
                  WHERE p.reserva_id = r.id AND p.anulado = false
               )
           AND NOT EXISTS (
                 SELECT 1 FROM movimientos_cuenta_corriente m
                  WHERE m.reserva_id = r.id
                    AND m.tipo = 'credito'
                    AND m.anulado = false
                    AND m.naturaleza IN ('anticipo', 'echeq_en_cartera', 'pago')
               )
         ORDER BY r.id
    """)).mappings().all()

    for r in huerfanas:
        monto = Decimal(str(r["anticipo_monto"]))
        creado = r["created_at"]
        fecha = r["anticipo_fecha"] or (creado.date() if hasattr(creado, "date") else creado)

        medio = (r["anticipo_medio_pago"] or "").strip().lower()
        if medio not in MEDIOS_VALIDOS:
            # Sin medio declarado lo más probable es que haya sido efectivo en
            # el mostrador, que es como se carga una seña al crear la reserva.
            # Queda dicho en las notas para que nadie lo lea como un dato duro.
            medio = "efectivo"

        pago_id = bind.execute(
            _tipando_montos("""
                INSERT INTO pagos
                       (cliente_id, alquiler_id, reserva_id, monto, medio_pago,
                        con_factura, cobrado_por, fecha, notas, anulado)
                VALUES (:cliente_id, NULL, :reserva_id, :monto, :medio,
                        false, :usuario_id, :fecha, :notas, false)
                RETURNING id
            """, "monto"),
            {
                "cliente_id": r["cliente_id"],
                "reserva_id": r["id"],
                "monto": monto,
                "medio": medio,
                "usuario_id": r["usuario_id"],
                "fecha": fecha,
                "notas": f"{MARCA} #{r['id']} ({medio})",
            },
        ).scalar_one()

        if medio in SIN_CREDITO_ANTICIPO:
            continue

        # ── El crédito en la cuenta corriente ─────────────────────────────
        # La cuenta se crea si no existe: es lo mismo que hace
        # `CuentaCorrienteService.get_or_create`.
        cc = bind.execute(
            sa.text("SELECT id, saldo FROM cuentas_corrientes WHERE cliente_id = :c"),
            {"c": r["cliente_id"]},
        ).mappings().first()
        if cc is None:
            cc_id = bind.execute(
                sa.text("""
                    INSERT INTO cuentas_corrientes (cliente_id, saldo, bloqueada, updated_at)
                    VALUES (:c, 0, false, :ahora)
                    RETURNING id
                """),
                {"c": r["cliente_id"], "ahora": ahora},
            ).scalar_one()
            saldo_previo = Decimal("0")
        else:
            cc_id = cc["id"]
            saldo_previo = Decimal(str(cc["saldo"]))

        # Un crédito reduce lo que el cliente debe (D-01: saldo positivo = debe).
        saldo_posterior = saldo_previo - monto

        mov_id = bind.execute(
            _tipando_montos("""
                INSERT INTO movimientos_cuenta_corriente
                       (cuenta_corriente_id, tipo, naturaleza, concepto, monto, fecha,
                        saldo_posterior, vencimiento_provisorio, reserva_id, pago_id,
                        anulado, creado_por, created_at)
                VALUES (:cc_id, 'credito', 'anticipo', :concepto, :monto, :fecha,
                        :saldo_posterior, false, :reserva_id, :pago_id,
                        false, :usuario_id, :ahora)
                RETURNING id
            """, "monto", "saldo_posterior"),
            {
                "cc_id": cc_id,
                "concepto": f"Seña de reserva #{r['id']} ({medio})",
                "monto": monto,
                "fecha": fecha,
                "saldo_posterior": saldo_posterior,
                "reserva_id": r["id"],
                "pago_id": pago_id,
                "usuario_id": r["usuario_id"],
                "ahora": ahora,
            },
        ).scalar_one()

        bind.execute(
            _tipando_montos(
                "UPDATE cuentas_corrientes SET saldo = :s, updated_at = :ahora WHERE id = :id",
                "s",
            ),
            {"s": saldo_posterior, "ahora": ahora, "id": cc_id},
        )

        # ── Si el auto ya salió, el anticipo ya se consumió ────────────────
        # `AlquilerService.checkout` marca aplicados los anticipos contra el
        # débito del alquiler. Como este crédito no existía cuando eso corrió,
        # hay que marcarlo ahora: si no queda "por aplicar" para siempre y
        # `deuda = saldo + anticipos` sobreestima por el importe entero de la
        # seña (`PLAN_DINERO.md` §4.2).
        #
        # La FK puede quedar en NULL: si el auto salió sin precio cargado no hay
        # débito contra el cual apuntar. El que manda es `aplicado_en`.
        alquiler_id = bind.execute(
            sa.text("SELECT id FROM alquileres WHERE reserva_id = :r"),
            {"r": r["id"]},
        ).scalar()
        if alquiler_id is not None:
            debito_id = bind.execute(
                sa.text("""
                    SELECT id FROM movimientos_cuenta_corriente
                     WHERE alquiler_id = :a AND tipo = 'debito'
                       AND naturaleza = 'alquiler' AND anulado = false
                     ORDER BY id LIMIT 1
                """),
                {"a": alquiler_id},
            ).scalar()
            bind.execute(
                sa.text("""
                    UPDATE movimientos_cuenta_corriente
                       SET aplicado_por_movimiento_id = :d, aplicado_en = :ahora
                     WHERE id = :m
                """),
                {"d": debito_id, "ahora": ahora, "m": mov_id},
            )


def downgrade() -> None:
    """
    Saca exactamente lo que puso, por la marca que dejó en el `Pago`.

    Primero devuelve el saldo de cada cuenta al valor que tenía antes del
    crédito —sumando de nuevo lo que el crédito había restado— y recién después
    borra los asientos: al revés, el saldo quedaría desincronizado del ledger.
    """
    bind = op.get_bind()
    patron = f"{MARCA}%"

    creditos = bind.execute(
        sa.text("""
            SELECT m.id, m.cuenta_corriente_id, m.monto
              FROM movimientos_cuenta_corriente m
              JOIN pagos p ON p.id = m.pago_id
             WHERE p.notas LIKE :patron
        """),
        {"patron": patron},
    ).mappings().all()

    for c in creditos:
        bind.execute(
            _tipando_montos(
                "UPDATE cuentas_corrientes SET saldo = saldo + :m WHERE id = :id", "m",
            ),
            {"m": Decimal(str(c["monto"])), "id": c["cuenta_corriente_id"]},
        )

    bind.execute(
        sa.text("""
            DELETE FROM movimientos_cuenta_corriente
             WHERE pago_id IN (SELECT id FROM pagos WHERE notas LIKE :patron)
        """),
        {"patron": patron},
    )
    bind.execute(
        sa.text("DELETE FROM pagos WHERE notas LIKE :patron"),
        {"patron": patron},
    )
