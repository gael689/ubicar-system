"""020_echeq_cliente_cc

Conecta el echeq al cliente y a la cuenta corriente (FIN-13/14/15/16).
Hoy un echeq recibido sólo guarda `contraparte` como texto libre — no hay
forma de saber de qué cliente es, ni de que su recepción impacte en la
cuenta corriente. Tampoco existía una forma de darlo de baja sin borrarlo
físicamente (regla "nunca eliminar").

echeqs tenía 0 filas al momento de escribir esta migración — riesgo mínimo.

Revision ID: 020_echeq_cliente_cc
Revises: 019_cc_ledger
Create Date: 2026-07-26
"""

from alembic import op
import sqlalchemy as sa

revision = '020_echeq_cliente_cc'
down_revision = '019_cc_ledger'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('echeqs', sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id'), nullable=True))
    op.add_column('echeqs', sa.Column('proveedor_nombre', sa.String(255), nullable=True))
    op.add_column('echeqs', sa.Column('fecha_acreditacion', sa.Date(), nullable=True))
    op.add_column('echeqs', sa.Column('motivo_rechazo', sa.Text(), nullable=True))
    op.add_column('echeqs', sa.Column('cuenta_corriente_id', sa.Integer(), sa.ForeignKey('cuentas_corrientes.id'), nullable=True))
    op.add_column(
        'echeqs',
        sa.Column('movimiento_cc_id', sa.Integer(), sa.ForeignKey('movimientos_cuenta_corriente.id'), nullable=True),
    )
    op.add_column('echeqs', sa.Column('activo', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('echeqs', sa.Column('creado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True))
    op.add_column('echeqs', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))

    op.create_index('ix_echeqs_cliente_id', 'echeqs', ['cliente_id'])


def downgrade() -> None:
    op.drop_index('ix_echeqs_cliente_id', table_name='echeqs')
    op.drop_column('echeqs', 'created_at')
    op.drop_column('echeqs', 'creado_por')
    op.drop_column('echeqs', 'activo')
    op.drop_column('echeqs', 'movimiento_cc_id')
    op.drop_column('echeqs', 'cuenta_corriente_id')
    op.drop_column('echeqs', 'motivo_rechazo')
    op.drop_column('echeqs', 'fecha_acreditacion')
    op.drop_column('echeqs', 'proveedor_nombre')
    op.drop_column('echeqs', 'cliente_id')
