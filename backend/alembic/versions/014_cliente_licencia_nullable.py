"""014_cliente_licencia_nullable

Hace nullable licencia_numero y licencia_categoria en clientes.
Hace nullable dni y licencia_numero en conductores_adicionales.

Revision ID: 014_cliente_licencia_nullable
Revises: 013_caja_echeq_cc
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa

revision = '014_cliente_licencia_nullable'
down_revision = '013_caja_echeq_cc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('clientes', 'licencia_numero',
                    existing_type=sa.String(50),
                    nullable=True,
                    server_default=None)
    op.alter_column('clientes', 'licencia_categoria',
                    existing_type=sa.String(5),
                    nullable=True,
                    server_default=None)
    op.alter_column('conductores_adicionales', 'dni',
                    existing_type=sa.String(20),
                    nullable=True,
                    server_default=None)
    op.alter_column('conductores_adicionales', 'licencia_numero',
                    existing_type=sa.String(50),
                    nullable=True,
                    server_default=None)


def downgrade() -> None:
    op.execute("UPDATE conductores_adicionales SET licencia_numero = '' WHERE licencia_numero IS NULL")
    op.execute("UPDATE conductores_adicionales SET dni = '' WHERE dni IS NULL")
    op.execute("UPDATE clientes SET licencia_categoria = '' WHERE licencia_categoria IS NULL")
    op.execute("UPDATE clientes SET licencia_numero = '' WHERE licencia_numero IS NULL")

    op.alter_column('conductores_adicionales', 'licencia_numero',
                    existing_type=sa.String(50),
                    nullable=False,
                    server_default='')
    op.alter_column('conductores_adicionales', 'dni',
                    existing_type=sa.String(20),
                    nullable=False,
                    server_default='')
    op.alter_column('clientes', 'licencia_categoria',
                    existing_type=sa.String(5),
                    nullable=False,
                    server_default='')
    op.alter_column('clientes', 'licencia_numero',
                    existing_type=sa.String(50),
                    nullable=False,
                    server_default='')
