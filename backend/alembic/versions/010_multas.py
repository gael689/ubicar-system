"""010_multas

Crea tabla `multas` para gestión de fotomultas/infracciones.
Incluye enums estado_multa, estado_limpieza, tipo_garantia, estado_garantia
que serán usados en migraciones subsiguientes.

Revision ID: 010_multas
Revises: 009_docs_cliente
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "010_multas"
down_revision = "009_docs_cliente"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "multas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("vehiculo_id", sa.Integer(), sa.ForeignKey("vehiculos.id"), nullable=True, index=True),
        sa.Column("patente", sa.String(20), nullable=False, index=True),
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id"), nullable=True, index=True),
        sa.Column("alquiler_id", sa.Integer(), sa.ForeignKey("alquileres.id"), nullable=True, index=True),
        sa.Column("fecha_infraccion", sa.Date(), nullable=False, index=True),
        sa.Column("hora_infraccion", sa.Time(), nullable=True),
        sa.Column("monto", sa.Numeric(12, 2), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("estado", sa.Enum("pendiente", "imputada", "cobrada", "apelando", name="estado_multa"), nullable=False, server_default="pendiente"),
        sa.Column("pdf_key", sa.String(512), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )


def downgrade() -> None:
    op.drop_table("multas")
    op.execute("DROP TYPE IF EXISTS estado_multa")
