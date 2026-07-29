"""Libro de auditoria: quien hizo que (plan 6.6)

Cada tabla ya guarda `creado_por`, y eso contesta "quien creo esto". No
contesta "quien anulo el movimiento de $400.000", "quien le bajo el precio a
esa reserva" ni "quien dio de baja al cliente": esas acciones no crean una
fila nueva, modifican una que ya existia. Con tres personas operando y plata
de por medio, ese es el registro que faltaba.

Es una tabla de solo agregar: no se edita ni se borra, y por eso no lleva
`activo` ni entra en la regla de baja logica del resto del sistema.

Revision ID: 053_auditoria
Revises: 052_email_aviso_reserva_web
"""
from alembic import op
import sqlalchemy as sa


revision = "053_auditoria"
down_revision = "052_email_aviso_reserva_web"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auditoria",
        sa.Column("id", sa.Integer(), nullable=False),
        # El nombre va copiado ademas de la FK: si el usuario se da de baja o
        # le cambian el nombre, el registro tiene que seguir diciendo quien
        # era en ese momento.
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("usuario_nombre", sa.String(length=150), nullable=True),
        sa.Column("accion", sa.String(length=40), nullable=False),
        sa.Column("entidad_tipo", sa.String(length=40), nullable=False),
        sa.Column("entidad_id", sa.Integer(), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column("datos_antes", sa.JSON(), nullable=True),
        sa.Column("datos_despues", sa.JSON(), nullable=True),
        sa.Column("monto", sa.Float(), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auditoria_id", "auditoria", ["id"])
    op.create_index("ix_auditoria_usuario_id", "auditoria", ["usuario_id"])
    op.create_index("ix_auditoria_accion", "auditoria", ["accion"])
    op.create_index("ix_auditoria_entidad_tipo", "auditoria", ["entidad_tipo"])
    op.create_index("ix_auditoria_entidad_id", "auditoria", ["entidad_id"])
    op.create_index("ix_auditoria_created_at", "auditoria", ["created_at"])
    # "Todo lo que le paso a esta reserva" es la consulta natural, y sin el
    # indice compuesto es un scan de la tabla entera.
    op.create_index("ix_auditoria_entidad", "auditoria", ["entidad_tipo", "entidad_id"])


def downgrade() -> None:
    op.drop_index("ix_auditoria_entidad", table_name="auditoria")
    op.drop_index("ix_auditoria_created_at", table_name="auditoria")
    op.drop_index("ix_auditoria_entidad_id", table_name="auditoria")
    op.drop_index("ix_auditoria_entidad_tipo", table_name="auditoria")
    op.drop_index("ix_auditoria_accion", table_name="auditoria")
    op.drop_index("ix_auditoria_usuario_id", table_name="auditoria")
    op.drop_index("ix_auditoria_id", table_name="auditoria")
    op.drop_table("auditoria")
