"""017_estado_reserva_vencida

Agrega el estado 'vencida' a estado_reserva: una reserva pasa a vencida cuando
se cumple fecha_fin/hora_fin y todavía no se registró el check-in (el auto no
volvió). Antes, la sincronización automática la pasaba directo a 'finalizada'
sin que existiera un check-in real, lo que impedía registrar devoluciones
tardías (el check-in exige estado 'activa').

Revision ID: 017_estado_reserva_vencida
Revises: 016_pago_intent_reserva
Create Date: 2026-07-26
"""

from alembic import op

revision = '017_estado_reserva_vencida'
down_revision = '016_pago_intent_reserva'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_reserva ADD VALUE IF NOT EXISTS 'vencida'")


def downgrade() -> None:
    # Los valores de enum no se pueden eliminar fácilmente en PostgreSQL
    pass
