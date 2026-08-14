"""062 - Autoresoluble, escalada_en y acuse por usuario

Plan de conexion (13/08) - Fase 1, cierra C-2/C-3/C-9.

**El bug que arregla:** `NotificacionService._auto_resolver` marca
"resuelta" a cualquier notificacion cuyo tipo no aparezca entre los
candidatos de la corrida actual. Las notificaciones de evento puntual
(`generar_una`, ej. "reserva web nueva", "contrato firmado") no salen de
ninguna regla del catalogo -- no tienen candidato con el que compararse -- asi
que la corrida siguiente del motor (08:00, o el boton "Actualizar" de la
campana) las borra sin que nadie las haya visto. `autoresoluble=false` las
saca de ese barrido: se resuelven a mano o cuando la entidad cambia de
estado, nunca por el paso del tiempo.

`escalada_en` sostiene el escalamiento por antigues (C-9): una reserva web
sin asignar sube de "alta" a "critica" sola despues de unas horas, y esta
columna evita que el motor la reescale en cada corrida.

`notificaciones_vistas` es el acuse por usuario: que Franco la lea no la
esconde para Martin. Reemplaza el uso de `Notificacion.estado = 'leida'`
como marca global.

Revision ID: 062_autoresoluble_y_acuse
Revises: 061_ventana_rotacion
"""
import sqlalchemy as sa
from alembic import op

revision = "062_autoresoluble_y_acuse"
down_revision = "061_ventana_rotacion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notificaciones",
        sa.Column("autoresoluble", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "notificaciones",
        sa.Column("escalada_en", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "notificaciones_vistas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "notificacion_id", sa.Integer(),
            sa.ForeignKey("notificaciones.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("visto_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_notificaciones_vistas_notificacion_id", "notificaciones_vistas", ["notificacion_id"]
    )
    op.create_index(
        "ix_notificaciones_vistas_usuario_id", "notificaciones_vistas", ["usuario_id"]
    )
    op.create_unique_constraint(
        "uq_notificaciones_vistas_notif_usuario",
        "notificaciones_vistas",
        ["notificacion_id", "usuario_id"],
    )


def downgrade() -> None:
    op.drop_table("notificaciones_vistas")
    op.drop_column("notificaciones", "escalada_en")
    op.drop_column("notificaciones", "autoresoluble")
