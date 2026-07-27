"""009_documentos_cliente_tarjeta

- Agrega columna cliente_id (nullable FK) a documentos para soportar docs de clientes/empresas
- Crea tabla tarjetas_cliente (datos de tarjeta bancaria por cliente, acceso protegido)

Revision ID: 009_docs_cliente
Revises: b7136e52843d
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "009_docs_cliente"
down_revision = "b7136e52843d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Agregar cliente_id a documentos (nullable: documentos de vehículo siguen con vehiculo_id)
    op.add_column(
        "documentos",
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id"), nullable=True),
    )
    op.create_index("ix_documentos_cliente_id", "documentos", ["cliente_id"])

    # Crear tabla tarjetas_cliente
    op.create_table(
        "tarjetas_cliente",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id"), nullable=False, unique=True, index=True),
        sa.Column("nombre_completo", sa.String(255), nullable=False),
        sa.Column("nro_tarjeta", sa.String(19), nullable=False),
        sa.Column("vencimiento", sa.String(7), nullable=False),
        sa.Column("codigo_3_digitos", sa.String(3), nullable=False),
        sa.Column("dni_titular", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tarjetas_cliente")
    op.drop_index("ix_documentos_cliente_id", table_name="documentos")
    op.drop_column("documentos", "cliente_id")
