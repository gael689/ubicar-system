"""019_cc_ledger

Rediseña la cuenta corriente como un ledger inmutable (Fase 1, primera
parte). El saldo deja de ser un número que se pisa: cada movimiento guarda
su saldo_posterior, se puede anular con un contra-asiento (nunca se borra ni
se edita), y suma condición de pago + fecha de vencimiento por movimiento
(pedido explícito) y por cuenta (default del cliente).

No incluye todavía: comprobante_id (la tabla `comprobantes` es un módulo
aparte, Fase 1 más adelante) ni el automatismo de generar el débito en cada
checkout (eso cambia comportamiento visible para todo alquiler nuevo y
merece su propio commit, no mezclado con el cambio de esquema).

Ambas tablas tenían 0 filas al momento de escribir esta migración
(verificado antes de migrar) — riesgo mínimo.

Revision ID: 019_cc_ledger
Revises: 018_fechas_date
Create Date: 2026-07-26
"""

from alembic import op
import sqlalchemy as sa

revision = '019_cc_ledger'
down_revision = '018_fechas_date'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── cuentas_corrientes ──────────────────────────────────────────────────
    op.add_column('cuentas_corrientes', sa.Column('condicion_pago', sa.String(20), nullable=True))
    op.add_column('cuentas_corrientes', sa.Column('limite_credito', sa.Numeric(12, 2), nullable=True))
    op.add_column('cuentas_corrientes', sa.Column('bloqueada', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('cuentas_corrientes', sa.Column('observaciones', sa.Text(), nullable=True))

    # ── movimientos_cuenta_corriente ────────────────────────────────────────
    op.add_column('movimientos_cuenta_corriente', sa.Column('condicion', sa.String(20), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('fecha_vencimiento', sa.Date(), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('saldo_posterior', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('movimientos_cuenta_corriente', sa.Column('pago_id', sa.Integer(), sa.ForeignKey('pagos.id'), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('echeq_id', sa.Integer(), sa.ForeignKey('echeqs.id'), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('multa_id', sa.Integer(), sa.ForeignKey('multas.id'), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('reserva_id', sa.Integer(), sa.ForeignKey('reservas.id'), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('anulado', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column(
        'movimientos_cuenta_corriente',
        sa.Column('anulado_por_movimiento_id', sa.Integer(), sa.ForeignKey('movimientos_cuenta_corriente.id'), nullable=True),
    )
    op.add_column('movimientos_cuenta_corriente', sa.Column('creado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True))
    op.add_column(
        'movimientos_cuenta_corriente',
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index(
        'ix_movimientos_cc_vencimiento', 'movimientos_cuenta_corriente', ['fecha_vencimiento'],
    )


def downgrade() -> None:
    op.drop_index('ix_movimientos_cc_vencimiento', table_name='movimientos_cuenta_corriente')

    op.drop_column('movimientos_cuenta_corriente', 'created_at')
    op.drop_column('movimientos_cuenta_corriente', 'creado_por')
    op.drop_column('movimientos_cuenta_corriente', 'anulado_por_movimiento_id')
    op.drop_column('movimientos_cuenta_corriente', 'anulado')
    op.drop_column('movimientos_cuenta_corriente', 'reserva_id')
    op.drop_column('movimientos_cuenta_corriente', 'multa_id')
    op.drop_column('movimientos_cuenta_corriente', 'echeq_id')
    op.drop_column('movimientos_cuenta_corriente', 'pago_id')
    op.drop_column('movimientos_cuenta_corriente', 'saldo_posterior')
    op.drop_column('movimientos_cuenta_corriente', 'fecha_vencimiento')
    op.drop_column('movimientos_cuenta_corriente', 'condicion')

    op.drop_column('cuentas_corrientes', 'observaciones')
    op.drop_column('cuentas_corrientes', 'bloqueada')
    op.drop_column('cuentas_corrientes', 'limite_credito')
    op.drop_column('cuentas_corrientes', 'condicion_pago')
