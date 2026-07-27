"""038_documentos_vehiculo_nullable

Bug preexistente: `documentos.vehiculo_id` quedo NOT NULL en la base aunque el
modelo lo declara `nullable=True` desde que se agregaron los documentos de
cliente. La migracion que sumo `cliente_id` no aflojo la restriccion, asi que
**subir cualquier documento a un cliente venia fallando** con NotNullViolation
(`DocumentoService.create_for_cliente` pasa `vehiculo_id=None` explicitamente).

Se detecto al archivar el PDF de confirmacion de reserva en el perfil del
cliente, que usa el mismo camino.

Revision ID: 038_documentos_vehiculo_nullable
Revises: 037_documento_tipo_reserva
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa

revision = '038_documentos_vehiculo_nullable'
down_revision = '037_documento_tipo_reserva'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('documentos', 'vehiculo_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # No se revierte: volver a NOT NULL romperia los documentos de cliente
    # (que legitimamente no tienen vehiculo). La restriccion original era el bug.
    pass
