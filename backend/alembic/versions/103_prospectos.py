"""Prospectos de Ubicar y sus campañas

Empresas que podrían alquilar, traídas del buscador de leads de Gael, cruzadas
contra los clientes de Ubicar, y las campañas que se arman sobre una selección.

Todo tablas nuevas: no toca nada existente.

Revision ID: 103_prospectos
Revises: 102_contrato_uber
"""
from alembic import op
import sqlalchemy as sa

revision = "103_prospectos"
down_revision = "102_contrato_uber"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prospectos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ref_externa", sa.String(80), nullable=True, unique=True),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("segmento", sa.String(80), nullable=True),
        sa.Column("ciudad", sa.String(80), nullable=True),
        sa.Column("direccion", sa.String(255), nullable=True),
        sa.Column("telefono", sa.String(40), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("website", sa.String(255), nullable=True),
        sa.Column("instagram", sa.String(120), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="nuevo"),
        sa.Column("ya_cliente_id", sa.Integer(), sa.ForeignKey("clientes.id"), nullable=True),
        sa.Column("cruce_por", sa.String(12), nullable=True),
        sa.Column("cruce_descartado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("contacto_previo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("contacto_previo_detalle", sa.String(255), nullable=True),
        sa.Column("no_contactar", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("no_contactar_motivo", sa.String(120), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    for col in ("nombre", "segmento", "ciudad", "estado", "ya_cliente_id", "no_contactar"):
        op.create_index(f"ix_prospectos_{col}", "prospectos", [col])

    op.create_table(
        "campanas_prospecto",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(120), nullable=False),
        sa.Column("canal", sa.String(10), nullable=False, server_default="email"),
        sa.Column("estado", sa.String(15), nullable=False, server_default="borrador"),
        sa.Column("filtro", sa.JSON(), nullable=True),
        sa.Column("incluir_contacto_previo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("asunto", sa.String(200), nullable=True),
        sa.Column("cuerpo", sa.Text(), nullable=True),
        sa.Column("creada_por", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("lanzada_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_campanas_prospecto_estado", "campanas_prospecto", ["estado"])

    op.create_table(
        "campana_destinatarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campana_id", sa.Integer(), sa.ForeignKey("campanas_prospecto.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prospecto_id", sa.Integer(), sa.ForeignKey("prospectos.id"), nullable=False),
        sa.Column("estado", sa.String(12), nullable=False, server_default="pendiente"),
        sa.Column("motivo", sa.String(120), nullable=True),
        sa.Column("enviado_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("campana_id", "prospecto_id", name="uq_campana_prospecto"),
    )
    op.create_index("ix_campana_destinatarios_campana_id", "campana_destinatarios", ["campana_id"])
    op.create_index("ix_campana_destinatarios_prospecto_id", "campana_destinatarios", ["prospecto_id"])


def downgrade() -> None:
    op.drop_table("campana_destinatarios")
    op.drop_table("campanas_prospecto")
    op.drop_table("prospectos")
