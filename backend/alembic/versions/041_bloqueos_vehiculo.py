"""041_bloqueos_vehiculo

Bloqueos de vehiculo por fecha (Fase 5, item 59 — plan §7.3).

`vehiculos.estado = fuera_de_servicio` es un booleano del presente: dice "hoy
no esta" pero no tiene fechas. Con eso no se puede contestar "esta libre del
3 al 10 de septiembre?" — que es lo que necesita la disponibilidad de la web
— ni cargar por adelantado que el auto entra a service el mes que viene.

El rango es INCLUSIVO en los dos extremos: un bloqueo del 3 al 5 ocupa los
dias 3, 4 y 5 completos.

Los bloqueos entran como una ventana mas en domain/solapamientos.py, asi que
rechazan reservas por el mismo camino que una reserva confirmada, sin una
segunda validacion paralela que despues se desincronice.

Revision ID: 041_bloqueos_vehiculo
Revises: 040_adicionales
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '041_bloqueos_vehiculo'
down_revision = '040_adicionales'
branch_labels = None
depends_on = None


motivo_bloqueo = sa.Enum(
    'mantenimiento', 'siniestro', 'uso_interno', 'venta', 'otro',
    name='motivo_bloqueo_vehiculo',
)


def upgrade() -> None:
    motivo_bloqueo.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'bloqueos_vehiculo',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vehiculo_id', sa.Integer(), nullable=False),
        sa.Column('fecha_desde', sa.Date(), nullable=False),
        sa.Column('fecha_hasta', sa.Date(), nullable=False),
        # postgresql.ENUM(create_type=False), NO sa.Enum: sa.Enum ignora
        # create_type e intenta recrear el tipo que ya creamos arriba.
        sa.Column('motivo', postgresql.ENUM(name='motivo_bloqueo_vehiculo', create_type=False),
                  nullable=False, server_default='mantenimiento'),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_por', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['vehiculo_id'], ['vehiculos.id']),
        sa.ForeignKeyConstraint(['creado_por'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bloqueos_vehiculo_id', 'bloqueos_vehiculo', ['id'])
    op.create_index('ix_bloqueos_vehiculo_vehiculo_id', 'bloqueos_vehiculo', ['vehiculo_id'])
    op.create_index('ix_bloqueos_vehiculo_fecha_desde', 'bloqueos_vehiculo', ['fecha_desde'])
    op.create_index('ix_bloqueos_vehiculo_fecha_hasta', 'bloqueos_vehiculo', ['fecha_hasta'])
    op.create_index('ix_bloqueos_vehiculo_motivo', 'bloqueos_vehiculo', ['motivo'])


def downgrade() -> None:
    op.drop_table('bloqueos_vehiculo')
    motivo_bloqueo.drop(op.get_bind(), checkfirst=True)
