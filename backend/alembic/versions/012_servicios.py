"""012_servicios

Crea la tabla `servicios` para el registro histórico de mantenimiento de vehículos.
Al registrar un servicio se actualiza km_proximo_service en el vehículo.

Revision ID: 012_servicios
Revises: 011_alquiler_limpieza_garantia
Create Date: 2026-06-25
"""

from alembic import op
import sqlalchemy as sa

revision = '012_servicios'
down_revision = '011_alquiler_limpieza_garantia'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'servicios',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vehiculo_id', sa.Integer(), sa.ForeignKey('vehiculos.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tipo', sa.Enum(
            'service_general', 'aceite', 'neumaticos', 'frenos',
            'filtros', 'correa', 'suspension', 'otro',
            name='tipo_servicio',
        ), nullable=False),
        sa.Column('km_realizado', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('costo', sa.Numeric(12, 2), nullable=True),
        sa.Column('proximo_km', sa.Integer(), nullable=True),
        sa.Column('proxima_fecha', sa.Date(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_servicios_vehiculo_id', 'servicios', ['vehiculo_id'])


def downgrade() -> None:
    op.drop_index('ix_servicios_vehiculo_id', 'servicios')
    op.drop_table('servicios')
    op.execute("DROP TYPE IF EXISTS tipo_servicio")
