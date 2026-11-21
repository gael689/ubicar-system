"""Tablero de Uber: lecturas semanales del odómetro

Pedido de Gael (21/11/2026): *"la parte de Uber bien funcional"*. El km de un
contrato de Uber se controlaba una sola vez, al devolver el auto. Esta tabla
guarda las lecturas que se cargan durante el contrato para poder avisar cuando
el chofer viene pasándose del tope.

Aditiva: una tabla nueva, sin tocar nada de lo que existe ni ningún ENUM. No
cobra ni asienta nada; el excedente se sigue cobrando en el check-in.

Revision ID: 110_uber_tablero
Revises: 109_campanas_envio
"""
from alembic import op
import sqlalchemy as sa

revision = "110_uber_tablero"
down_revision = "109_campanas_envio"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "uber_lecturas_km",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alquiler_id", sa.Integer(), sa.ForeignKey("alquileres.id"), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("km", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_uber_lecturas_km_id", "uber_lecturas_km", ["id"])
    op.create_index("ix_uber_lecturas_km_alquiler_id", "uber_lecturas_km", ["alquiler_id"])


def downgrade() -> None:
    op.drop_index("ix_uber_lecturas_km_alquiler_id", table_name="uber_lecturas_km")
    op.drop_index("ix_uber_lecturas_km_id", table_name="uber_lecturas_km")
    op.drop_table("uber_lecturas_km")
