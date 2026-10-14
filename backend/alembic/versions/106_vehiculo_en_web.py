"""Cada vehículo dice si cuenta para la web

Pedido del cliente (14/10/2026): Ubicar alquila autos de terceros para
realquilarlos. Entran a la flota por unas semanas y después se dan de baja.
Con el sitio vendiendo solo, esos autos sumaban cupo: la web ofrecía una unidad
que en dos semanas ya no iba a estar.

`en_web = false` saca el auto **sólo** del cupo de la web. Para el mostrador
sigue siendo un auto más: se reserva, se contrata y se ve en el calendario.

Arranca en `true` para toda la flota existente: nada cambia hasta que alguien
destilde un auto.

Revision ID: 106_vehiculo_en_web
Revises: 105_medio_pago_otro
"""
import sqlalchemy as sa
from alembic import op

revision = "106_vehiculo_en_web"
down_revision = "105_medio_pago_otro"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehiculos",
        sa.Column("en_web", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("vehiculos", "en_web")
