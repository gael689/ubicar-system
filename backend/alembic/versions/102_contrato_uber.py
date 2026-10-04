"""Contrato de Uber: tipo de reserva, valor semanal, kilometraje y fechas de pago

Pedido de Franco (01/10/2026). Una reserva puede ser `alquiler` (lo de siempre)
o `uber`, que lleva el valor de la semana, los km permitidos por semana, el
precio del km extra y las fechas en que se paga cada semana.

Todo aditivo y con default: las reservas existentes quedan como `alquiler` y no
se enteran. Sin migración de datos.

Revision ID: 102_contrato_uber
Revises: 101_reservas_fantasma
"""
from alembic import op
import sqlalchemy as sa

revision = "102_contrato_uber"
down_revision = "101_reservas_fantasma"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservas", sa.Column("tipo", sa.String(10), nullable=False, server_default="alquiler"))
    op.add_column("reservas", sa.Column("uber_valor_semana", sa.Numeric(12, 2), nullable=True))
    op.add_column("reservas", sa.Column("uber_km_semana", sa.Integer(), nullable=True))
    op.add_column("reservas", sa.Column("uber_precio_km_extra", sa.Numeric(12, 2), nullable=True))
    op.add_column("reservas", sa.Column("fechas_pago", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("reservas", "fechas_pago")
    op.drop_column("reservas", "uber_precio_km_extra")
    op.drop_column("reservas", "uber_km_semana")
    op.drop_column("reservas", "uber_valor_semana")
    op.drop_column("reservas", "tipo")
