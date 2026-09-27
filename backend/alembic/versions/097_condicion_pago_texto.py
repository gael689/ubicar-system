"""Condición de pago: una aclaración en texto libre

Pedido del cliente (plan 27/09/2026, txt 10): las opciones fijas (contado,
cuenta corriente a N días) no alcanzan para lo que se pacta en el mostrador —
"50% al retirar y el resto a 15 días", "paga la empresa contra factura"—. El
texto sale en el PDF de la reserva y en el resumen del wizard.

Nullable y sin default: las reservas existentes no tienen aclaración, y no hay
nada que inventarles.

Revision ID: 097_condicion_pago_texto
Revises: 096_pagare_franquicia
"""
import sqlalchemy as sa
from alembic import op

revision = "097_condicion_pago_texto"
down_revision = "096_pagare_franquicia"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservas", sa.Column("condicion_pago_texto", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reservas", "condicion_pago_texto")
