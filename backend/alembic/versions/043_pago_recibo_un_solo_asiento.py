"""043_pago_recibo_un_solo_asiento

Un hecho economico, un asiento (PLAN_MAESTRO 2.12).

Hasta aca `Pago` y `Recibo` eran dos caminos paralelos y desconectados para el
mismo hecho: los dos generaban su propio credito en la cuenta corriente y no se
conocian entre si. Cobrar $50.000 y emitir el recibo de ese cobro bajaba el
saldo $100.000. Como la intencion del negocio es emitir recibo en CADA cobro,
eso no era un caso de borde: pasaba siempre.

El `Pago` es el hecho economico; el `Recibo` es el papel que lo documenta. Un
papel no mueve plata.

Tres cambios:

1. `pagos.alquiler_id` pasa a NULLABLE y se suma `pagos.cliente_id`. Esto
   cierra ademas el bug 2.6 del plan maestro, abierto desde el diagnostico
   original: hoy no se puede registrar un pago a cuenta, ni una sena de una
   reserva web sin alquiler todavia, ni el pago de una multa. El cliente pasa a
   ser el dato obligatorio (siempre se le cobra a alguien) y el alquiler el
   opcional.

2. `recibos.pago_id` FK al pago que documenta. Nullable en la base para poder
   backfillear los recibos ya emitidos; obligatorio en el service de ahi en
   mas.

3. `recibos.movimiento_cc_id` pasa a NULLABLE: los recibos nuevos no generan
   movimiento propio, asi que no tienen ninguno que referenciar.

BACKFILL. Los recibos existentes generaron un credito que ahora seria del
`Pago`. Se les crea el `Pago` correspondiente (con `cliente_id`, sin alquiler)
y se le reasigna el movimiento que ya existia — no se crea ni se anula ningun
asiento, porque el saldo actual ya es el correcto: hasta hoy nadie podia haber
hecho el doble credito de forma sistematica (no habia UI que emitiera un recibo
sobre un pago). Reasignar es mas seguro que compensar: mantiene el saldo
intacto y deja el ledger coherente con el modelo nuevo.

Revision ID: 043_pago_recibo_un_solo_asiento
Revises: 042_reserva_por_categoria
"""
from alembic import op
import sqlalchemy as sa


revision = '043_pago_recibo_un_solo_asiento'
down_revision = '042_reserva_por_categoria'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Pago: cliente propio, alquiler opcional ────────────────────────
    op.add_column('pagos', sa.Column('cliente_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_pagos_cliente', 'pagos', 'clientes', ['cliente_id'], ['id'])
    op.create_index('ix_pagos_cliente_id', 'pagos', ['cliente_id'])

    # Backfill: el cliente sale del alquiler -> reserva -> cliente.
    op.execute("""
        UPDATE pagos p
        SET cliente_id = r.cliente_id
        FROM alquileres a
        JOIN reservas r ON r.id = a.reserva_id
        WHERE p.alquiler_id = a.id AND p.cliente_id IS NULL
    """)

    op.alter_column('pagos', 'alquiler_id', existing_type=sa.Integer(), nullable=True)

    # ── 2. Recibo: documenta un pago ──────────────────────────────────────
    op.add_column('recibos', sa.Column('pago_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_recibos_pago', 'recibos', 'pagos', ['pago_id'], ['id'])
    op.create_index('ix_recibos_pago_id', 'recibos', ['pago_id'])

    op.alter_column('recibos', 'movimiento_cc_id', existing_type=sa.Integer(), nullable=True)

    # ── 3. Backfill de los recibos ya emitidos ────────────────────────────
    # Un Pago por cada recibo vigente, y el movimiento que ese recibo habia
    # generado pasa a colgar del Pago nuevo. El saldo no se toca.
    conn = op.get_bind()
    recibos = conn.execute(sa.text("""
        SELECT id, cliente_id, fecha, monto, medio_pago, concepto,
               movimiento_cc_id, creado_por
        FROM recibos
        WHERE estado = 'emitido' AND pago_id IS NULL
    """)).fetchall()

    for r in recibos:
        # `medio_pago` de recibos no incluye 'cuenta_corriente'; los valores
        # que si comparte con pagos coinciden uno a uno.
        pago_id = conn.execute(sa.text("""
            INSERT INTO pagos (cliente_id, alquiler_id, monto, medio_pago,
                               con_factura, cobrado_por, fecha, notas)
            VALUES (:cliente_id, NULL, :monto, :medio_pago,
                    false, :cobrado_por, :fecha, :notas)
            RETURNING id
        """), {
            "cliente_id": r.cliente_id,
            "monto": r.monto,
            "medio_pago": r.medio_pago,
            "cobrado_por": r.creado_por,
            "fecha": r.fecha,
            "notas": f"Generado por la migracion 043 desde el recibo #{r.id}",
        }).scalar()

        conn.execute(sa.text("UPDATE recibos SET pago_id = :p WHERE id = :r"),
                     {"p": pago_id, "r": r.id})

        # El asiento existente ahora pertenece al pago. Se conserva
        # `recibo_id` para no perder el vinculo con el papel.
        if r.movimiento_cc_id:
            conn.execute(sa.text("""
                UPDATE movimientos_cuenta_corriente
                SET pago_id = :p
                WHERE id = :m
            """), {"p": pago_id, "m": r.movimiento_cc_id})


def downgrade() -> None:
    op.drop_index('ix_recibos_pago_id', table_name='recibos')
    op.drop_constraint('fk_recibos_pago', 'recibos', type_='foreignkey')
    op.drop_column('recibos', 'pago_id')

    op.alter_column('pagos', 'alquiler_id', existing_type=sa.Integer(), nullable=False)
    op.drop_index('ix_pagos_cliente_id', table_name='pagos')
    op.drop_constraint('fk_pagos_cliente', 'pagos', type_='foreignkey')
    op.drop_column('pagos', 'cliente_id')
