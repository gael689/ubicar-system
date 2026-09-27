"""La baja de un vehículo guarda el motivo y la fecha

Pedido del cliente (27/09/2026): dar de baja un auto era un "¿seguro?" sin
más, y meses después nadie sabía si ese auto inactivo se vendió, se chocó o
se lo robaron. La baja ahora pide el motivo (vendido, siniestro, robo, fin de
leasing u otro) y guarda cuándo fue. Reactivar lo limpia.

Revision ID: 099_motivo_baja_vehiculo
Revises: 097_condicion_pago_texto (se re-encadena al integrar los paquetes)
"""
import sqlalchemy as sa
from alembic import op

revision = "099_motivo_baja_vehiculo"
down_revision = "097_condicion_pago_texto"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehiculos", sa.Column("motivo_baja", sa.Text(), nullable=True))
    op.add_column("vehiculos", sa.Column("fecha_baja", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("vehiculos", "fecha_baja")
    op.drop_column("vehiculos", "motivo_baja")
