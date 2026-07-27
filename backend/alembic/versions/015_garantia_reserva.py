"""015_garantia_reserva

Agrega campos de garantía/depósito a la tabla reservas.
La garantía ahora se define al momento de crear la reserva.

Revision ID: 015_garantia_reserva
Revises: 014_cliente_licencia_nullable
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa

revision = '015_garantia_reserva'
down_revision = '014_cliente_licencia_nullable'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reservas', sa.Column('garantia_tipo', sa.String(30), nullable=True))
    op.add_column('reservas', sa.Column('garantia_monto', sa.Numeric(12, 2), nullable=True))
    op.add_column('reservas', sa.Column('garantia_tarjeta_numero', sa.String(20), nullable=True))
    op.add_column('reservas', sa.Column('garantia_tarjeta_vencimiento', sa.String(10), nullable=True))
    op.add_column('reservas', sa.Column('garantia_tarjeta_titular', sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column('reservas', 'garantia_tarjeta_titular')
    op.drop_column('reservas', 'garantia_tarjeta_vencimiento')
    op.drop_column('reservas', 'garantia_tarjeta_numero')
    op.drop_column('reservas', 'garantia_monto')
    op.drop_column('reservas', 'garantia_tipo')
