"""022_recibos

Módulo de Recibos: comprobante de cobro con numeración vía secuencia de
Postgres (recibos_numero_seq, nunca MAX+1 — D-14), que genera un crédito
en la cuenta corriente del cliente (mismo patrón que pago/echeq/multa).

Anulación: contra-asiento en la cuenta corriente (no se edita ni se borra
el recibo — ver regla "nunca eliminar"), por eso agrega motivo_anulacion /
anulado_por / anulado_en en vez de un estado "editado".

recibos no existe aún — 0 filas, riesgo mínimo.

Revision ID: 022_recibos
Revises: 021_multa_cc
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '022_recibos'
down_revision = '021_multa_cc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS recibos_numero_seq START WITH 1")
    op.execute("CREATE TYPE medio_pago_recibo AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'echeq')")
    op.execute("CREATE TYPE estado_recibo AS ENUM ('emitido', 'anulado')")

    op.create_table(
        'recibos',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('numero', sa.Integer(), nullable=False, server_default=sa.text("nextval('recibos_numero_seq')")),
        sa.Column('prefijo', sa.String(5), nullable=False, server_default='R'),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id'), nullable=False),
        sa.Column('cuenta_corriente_id', sa.Integer(), sa.ForeignKey('cuentas_corrientes.id'), nullable=False),
        sa.Column('movimiento_cc_id', sa.Integer(), sa.ForeignKey('movimientos_cuenta_corriente.id'), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('monto', sa.Numeric(12, 2), nullable=False),
        sa.Column('medio_pago', postgresql.ENUM(name='medio_pago_recibo', create_type=False), nullable=False),
        sa.Column('concepto', sa.Text(), nullable=False),
        sa.Column('saldo_anterior', sa.Numeric(12, 2), nullable=False),
        sa.Column('saldo_posterior', sa.Numeric(12, 2), nullable=False),
        sa.Column('estado', postgresql.ENUM(name='estado_recibo', create_type=False), nullable=False, server_default='emitido'),
        sa.Column('motivo_anulacion', sa.Text(), nullable=True),
        sa.Column('anulado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('anulado_en', sa.DateTime(), nullable=True),
        sa.Column('archivo_key', sa.String(500), nullable=True),
        sa.Column('creado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_unique_constraint('uq_recibos_numero', 'recibos', ['numero'])
    op.create_index('ix_recibos_cliente_id', 'recibos', ['cliente_id'])
    op.execute("ALTER SEQUENCE recibos_numero_seq OWNED BY recibos.numero")

    op.add_column(
        'movimientos_cuenta_corriente',
        sa.Column('recibo_id', sa.Integer(), sa.ForeignKey('recibos.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('movimientos_cuenta_corriente', 'recibo_id')
    op.drop_table('recibos')
    op.execute("DROP TYPE estado_recibo")
    op.execute("DROP TYPE medio_pago_recibo")
    op.execute("DROP SEQUENCE IF EXISTS recibos_numero_seq")
