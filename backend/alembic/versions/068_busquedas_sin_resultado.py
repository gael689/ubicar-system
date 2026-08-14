"""068 - Demanda insatisfecha: busquedas_sin_resultado (D-04, plan 13/08 §3.9)

Estadistica pura -- fecha, categoria, motivo, boton elegido -- sin contacto
y sin bandeja. Sostiene la mitad de D-04 que el cartel de derivacion
comercial (§3.9) le saca a la reserva SIN_DISPONIBILIDAD: "medir la demanda
insatisfecha por categoria" sin depender de que alguien complete un
formulario.

Revision ID: 068_busquedas_sin_resultado
Revises: 067_upgrade_categoria
"""
import sqlalchemy as sa
from alembic import op

revision = "068_busquedas_sin_resultado"
down_revision = "067_upgrade_categoria"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "busquedas_sin_resultado",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("categoria_id", sa.Integer(), sa.ForeignKey("categorias.id"), nullable=True),
        sa.Column("fecha_inicio", sa.Date(), nullable=True),
        sa.Column("fecha_fin", sa.Date(), nullable=True),
        sa.Column("motivo", sa.String(30), nullable=False),
        sa.Column("boton_elegido", sa.String(20), nullable=False),
    )
    op.create_index("ix_busquedas_sin_resultado_created_at", "busquedas_sin_resultado", ["created_at"])
    op.create_index("ix_busquedas_sin_resultado_categoria_id", "busquedas_sin_resultado", ["categoria_id"])
    op.create_index("ix_busquedas_sin_resultado_motivo", "busquedas_sin_resultado", ["motivo"])
    op.create_index("ix_busquedas_sin_resultado_boton_elegido", "busquedas_sin_resultado", ["boton_elegido"])


def downgrade() -> None:
    op.drop_table("busquedas_sin_resultado")
