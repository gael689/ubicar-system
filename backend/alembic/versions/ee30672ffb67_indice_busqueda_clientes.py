"""indice_busqueda_clientes

Revision ID: ee30672ffb67
Revises: a5a4d5ad50e5
Create Date: 2026-05-19 23:57:57.577838

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ee30672ffb67'
down_revision: Union[str, None] = 'a5a4d5ad50e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE INDEX ix_clientes_nombre_trgm ON clientes USING gin (nombre_completo gin_trgm_ops);")
    op.execute("CREATE INDEX ix_clientes_dni_trgm ON clientes USING gin (dni_cuit gin_trgm_ops);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_clientes_nombre_trgm;")
    op.execute("DROP INDEX IF EXISTS ix_clientes_dni_trgm;")

