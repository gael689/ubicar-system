"""024_conductor_reserva

Conductor != pagador (Fase 1, ítem 20): la reserva puede tener un conductor
distinto del cliente que paga — necesario sobre todo para empresas, donde
quien firma/paga no es quien maneja. Si `conductor_id` es NULL, el cliente
es el conductor (comportamiento actual, sin cambios).

`conductor_id` apunta a `conductores_adicionales`, que ya existe (y ya tiene
`activo` desde la migración 023) — no hace falta una tabla nueva.

reservas tenía varias filas al momento de escribir esta migración, todas con
conductor_id NULL implícito (columna nueva) — no rompe nada existente.

Revision ID: 024_conductor_reserva
Revises: 023_datos_fiscales_cliente
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '024_conductor_reserva'
down_revision = '023_datos_fiscales_cliente'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'reservas',
        sa.Column('conductor_id', sa.Integer(), sa.ForeignKey('conductores_adicionales.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('reservas', 'conductor_id')
