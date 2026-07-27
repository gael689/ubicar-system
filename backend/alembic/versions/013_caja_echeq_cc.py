"""013_caja_echeq_cc

Amplía estado_echeq con los estados del flujo completo (en_cartera, depositado, endosado)
y agrega cuenta_corriente a medio_pago para habilitar cobros contra CC de clientes.

Revision ID: 013_caja_echeq_cc
Revises: 012_servicios
Create Date: 2026-06-26
"""

from alembic import op

revision = '013_caja_echeq_cc'
down_revision = '012_servicios'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_echeq ADD VALUE IF NOT EXISTS 'en_cartera'")
    op.execute("ALTER TYPE estado_echeq ADD VALUE IF NOT EXISTS 'depositado'")
    op.execute("ALTER TYPE estado_echeq ADD VALUE IF NOT EXISTS 'endosado'")
    op.execute("ALTER TYPE medio_pago ADD VALUE IF NOT EXISTS 'cuenta_corriente'")


def downgrade() -> None:
    # Los valores de enum no se pueden eliminar fácilmente en PostgreSQL
    pass
