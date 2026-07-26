"""021_multa_cc

Conecta la multa a la cuenta corriente: imputar a un cliente genera un
débito automático (movimientos_cuenta_corriente.multa_id ya existía desde
la migración 019). Agrega el estado 'bonificada' — antes sólo existía
'cobrada', que no distinguía "el cliente pagó" de "se la perdonamos".

multas tenía 0 filas al momento de escribir esta migración — riesgo mínimo.

Revision ID: 021_multa_cc
Revises: 020_echeq_cliente_cc
Create Date: 2026-07-26
"""

from alembic import op
import sqlalchemy as sa

revision = '021_multa_cc'
down_revision = '020_echeq_cliente_cc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_multa ADD VALUE IF NOT EXISTS 'bonificada'")
    op.add_column('multas', sa.Column('motivo_bonificacion', sa.Text(), nullable=True))
    op.add_column('multas', sa.Column('resuelto_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True))
    op.add_column('multas', sa.Column('resuelto_en', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('multas', 'resuelto_en')
    op.drop_column('multas', 'resuelto_por')
    op.drop_column('multas', 'motivo_bonificacion')
    # Los valores de enum no se pueden eliminar fácilmente en PostgreSQL
