"""067 - Registro de upgrade de categoria (D-54)

Plan de conexion (13/08), punto 3.5. `asignar_vehiculo` ya podia poner un
auto de cualquier categoria sin tocar el precio -- eso es exactamente
"upgrade al mismo precio" -- pero no quedaba ningun registro de que habia
pasado, ni forma de contestar "cuantos upgrades regalamos este verano", ni
nada que impidiera un downgrade silencioso.

`categoria_id` sigue siendo la **pedida** (no se toca, el cupo se sigue
contando igual); `categoria_entregada_id` es la real cuando difiere.

Revision ID: 067_upgrade_categoria
Revises: 066_lugares_retiro_config
"""
import sqlalchemy as sa
from alembic import op

revision = "067_upgrade_categoria"
down_revision = "066_lugares_retiro_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reservas",
        sa.Column("categoria_entregada_id", sa.Integer(), sa.ForeignKey("categorias.id"), nullable=True),
    )
    op.add_column("reservas", sa.Column("upgrade_motivo", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reservas", "upgrade_motivo")
    op.drop_column("reservas", "categoria_entregada_id")
