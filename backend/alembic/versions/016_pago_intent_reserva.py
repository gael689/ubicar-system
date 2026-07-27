"""016_pago_intent_reserva

Revision ID: 016_pago_intent_reserva
Revises: 015_garantia_reserva
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa

revision = '016_pago_intent_reserva'
down_revision = '015_garantia_reserva'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('reservas', sa.Column('forma_pago_prevista', sa.String(30), nullable=True))
    op.add_column('reservas', sa.Column('estado_pago', sa.String(20), server_default='pendiente', nullable=False))
    op.add_column('reservas', sa.Column('anticipo_monto', sa.Numeric(12, 2), nullable=True))
    op.add_column('reservas', sa.Column('anticipo_fecha', sa.String(10), nullable=True))
    op.add_column('reservas', sa.Column('anticipo_medio_pago', sa.String(30), nullable=True))

def downgrade() -> None:
    op.drop_column('reservas', 'anticipo_medio_pago')
    op.drop_column('reservas', 'anticipo_fecha')
    op.drop_column('reservas', 'anticipo_monto')
    op.drop_column('reservas', 'estado_pago')
    op.drop_column('reservas', 'forma_pago_prevista')
