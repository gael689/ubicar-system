"""060 - Registro de los mails que manda el sistema

Hasta ahora un envio se hacia y se olvidaba: `enviar_email` devolvia True o
False, alguien lo logueaba, y ahi moria. Cuando un cliente llamaba diciendo
que no le llego la confirmacion, la unica respuesta honesta era "no se" —
salvo que alguien pudiera entrar al servidor a leer logs, cosa que nadie del
mostrador puede hacer.

Esta tabla guarda **el intento**, no el exito. Una fila `fallido` con el
error de Resend vale tanto como una `enviado`. El tercer estado, `omitido`,
es el menos obvio y el mas necesario hoy: el mail no se intento a proposito,
porque el remitente configurado es el de prueba de Resend y a un cliente real
no le llegaria. Distinguirlo de `fallido` es la diferencia entre "el sistema
esta roto" y "todavia falta verificar el dominio".

Revision ID: 060_emails_enviados
Revises: 059_transferencia_y_iibb
"""
import sqlalchemy as sa
from alembic import op

revision = "060_emails_enviados"
down_revision = "059_transferencia_y_iibb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "emails_enviados",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("destinatario", sa.String(length=255), nullable=False),
        sa.Column("remitente", sa.String(length=255), nullable=False),
        sa.Column("asunto", sa.String(length=255), nullable=False),
        sa.Column("cuerpo_html", sa.Text(), nullable=True),
        sa.Column("entidad_tipo", sa.String(length=30), nullable=True),
        sa.Column("entidad_id", sa.Integer(), nullable=True),
        sa.Column(
            "estado",
            sa.Enum("enviado", "fallido", "omitido", name="estado_email"),
            nullable=False,
            server_default="enviado",
        ),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("proveedor_id", sa.String(length=100), nullable=True),
        sa.Column("con_adjunto", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("automatico", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("intentos", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("enviado_por", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("ultimo_intento_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["enviado_por"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_emails_enviados_id", "emails_enviados", ["id"])
    op.create_index("ix_emails_enviados_tipo", "emails_enviados", ["tipo"])
    op.create_index("ix_emails_enviados_estado", "emails_enviados", ["estado"])
    op.create_index("ix_emails_enviados_destinatario", "emails_enviados", ["destinatario"])
    # El panel entra siempre por "que se mando de esta reserva / de este
    # alquiler", asi que el indice va sobre el par y no sobre entidad_id solo.
    op.create_index(
        "ix_emails_enviados_entidad", "emails_enviados", ["entidad_tipo", "entidad_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_emails_enviados_entidad", table_name="emails_enviados")
    op.drop_index("ix_emails_enviados_destinatario", table_name="emails_enviados")
    op.drop_index("ix_emails_enviados_estado", table_name="emails_enviados")
    op.drop_index("ix_emails_enviados_tipo", table_name="emails_enviados")
    op.drop_index("ix_emails_enviados_id", table_name="emails_enviados")
    op.drop_table("emails_enviados")
    sa.Enum(name="estado_email").drop(op.get_bind(), checkfirst=True)
