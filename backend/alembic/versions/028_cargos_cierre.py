"""028_cargos_cierre

Cargos de cierre: combustible faltante y limpieza (Fase 1, ítem 24).

Ambos son montos editables por el operador al check-in (no hay capacidad de
tanque por vehículo — decisión explícita del usuario: es sólo visual el
nivel de combustible, no se calculan litros). `checkout_combustible` /
`checkin_combustible` y `checkin_estado_limpieza` ya existían — esto sólo
agrega el monto a cobrar, siguiendo el mismo patrón que `cargo_excedente`.

alquileres tenía algunas filas al momento de escribir esta migración, todas
con estos campos en 0 por default — no rompe nada existente.

Revision ID: 028_cargos_cierre
Revises: 027_sena_checkout_tardio
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '028_cargos_cierre'
down_revision = '027_sena_checkout_tardio'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('alquileres', sa.Column('cargo_combustible', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('alquileres', sa.Column('cargo_limpieza', sa.Numeric(12, 2), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('alquileres', 'cargo_limpieza')
    op.drop_column('alquileres', 'cargo_combustible')
