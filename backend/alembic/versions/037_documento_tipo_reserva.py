"""037_documento_tipo_reserva

Suma 'reserva' al enum `tipo_documento`. El PDF de confirmacion de reserva se
archiva automaticamente en el perfil del cliente al crear la reserva, y sin
este valor tendria que guardarse como 'otro', mezclado con cualquier adjunto
suelto y sin forma de filtrarlo.

ALTER TYPE ... ADD VALUE no corre dentro de un bloque de transaccion en
Postgres < 12; se ejecuta con autocommit para que funcione en cualquier
version.

Revision ID: 037_documento_tipo_reserva
Revises: 036_fechas_especiales
Create Date: 2026-07-27
"""
from alembic import op

revision = '037_documento_tipo_reserva'
down_revision = '036_fechas_especiales'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE tipo_documento ADD VALUE IF NOT EXISTS 'reserva'")


def downgrade() -> None:
    # Postgres no permite quitar un valor de un enum sin recrear el tipo y
    # reescribir todas las columnas que lo usan. El valor de mas es inocuo:
    # no se revierte a proposito.
    pass
