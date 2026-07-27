"""rename_documento_url_archivo_to_archivo_key

Revision ID: a5a4d5ad50e5
Revises: c331c7365da8
Create Date: 2026-05-18 23:21:06.461014

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5a4d5ad50e5'
down_revision: Union[str, None] = 'c331c7365da8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename preserva datos (autogen había generado drop+add destructivo).
    op.alter_column('documentos', 'url_archivo', new_column_name='archivo_key')


def downgrade() -> None:
    op.alter_column('documentos', 'archivo_key', new_column_name='url_archivo')
