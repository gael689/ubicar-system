"""039_motor_precios

Motor de precios por calendario (Fase 5, item 57 — plan §7.2).

Es la forma en que los duenos dijeron que quieren cargar los precios: un
precio base anual, precios fijos para las fechas que mueven la aguja
(Navidad, Dia del Amigo) y promociones encima. Las tres capas son la misma
tabla con distinta `prioridad`, y la de mayor prioridad que cubre el dia
gana SIN borrar lo de abajo.

`tarifas_calendario.fecha_especial_id` es el enganche con la migracion 036:
una regla de precio puede apuntar a una fecha especial en vez de repetir el
rango a mano, asi "Navidad 2026" se define una sola vez y sirve para el
calendario de ocupacion y para el precio.

NO se siembra ninguna regla: los precios base los cargan Franco y Martin
desde la pantalla. Sembrar precios inventados seria peor que no tener
ninguno — sin reglas cargadas el sistema sigue cotizando con las tarifas por
banda de siempre (domain/tarifas.py), que pasa a ser el caso de prioridad
mas baja del motor.

Revision ID: 039_motor_precios
Revises: 038_documentos_vehiculo_nullable
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '039_motor_precios'
down_revision = '038_documentos_vehiculo_nullable'
branch_labels = None
depends_on = None


canal_tarifa_calendario = sa.Enum(
    'ambos', 'web', 'mostrador', name='canal_tarifa_calendario'
)


def upgrade() -> None:
    bind = op.get_bind()
    canal_tarifa_calendario.create(bind, checkfirst=True)

    op.create_table(
        'tarifas_calendario',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=120), nullable=False),
        sa.Column('categoria_id', sa.Integer(), nullable=True),
        sa.Column('vehiculo_id', sa.Integer(), nullable=True),
        sa.Column('fecha_especial_id', sa.Integer(), nullable=True),
        # Nullable porque el rango puede venir heredado de la fecha especial.
        sa.Column('fecha_desde', sa.Date(), nullable=True),
        sa.Column('fecha_hasta', sa.Date(), nullable=True),
        sa.Column('dias_semana', sa.JSON(), nullable=True),
        sa.Column('precio_dia', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('prioridad', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('min_dias', sa.Integer(), nullable=True),
        sa.Column('max_dias', sa.Integer(), nullable=True),
        # postgresql.ENUM(create_type=False) y NO sa.Enum: sa.Enum ignora
        # create_type e intenta recrear el tipo que ya creamos arriba, con lo
        # cual la migracion revienta con DuplicateObject.
        sa.Column(
            'canal',
            postgresql.ENUM(name='canal_tarifa_calendario', create_type=False),
            nullable=False, server_default='ambos',
        ),
        sa.Column('es_promocional', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('precio_referencia', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('etiqueta_promo', sa.String(length=80), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_por', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['categoria_id'], ['categorias.id']),
        sa.ForeignKeyConstraint(['vehiculo_id'], ['vehiculos.id']),
        sa.ForeignKeyConstraint(['fecha_especial_id'], ['fechas_especiales.id']),
        sa.ForeignKeyConstraint(['creado_por'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tarifas_calendario_id', 'tarifas_calendario', ['id'])
    op.create_index('ix_tarifas_calendario_categoria_id', 'tarifas_calendario', ['categoria_id'])
    op.create_index('ix_tarifas_calendario_vehiculo_id', 'tarifas_calendario', ['vehiculo_id'])
    op.create_index('ix_tarifas_calendario_fecha_especial_id', 'tarifas_calendario', ['fecha_especial_id'])
    op.create_index('ix_tarifas_calendario_fecha_desde', 'tarifas_calendario', ['fecha_desde'])
    op.create_index('ix_tarifas_calendario_fecha_hasta', 'tarifas_calendario', ['fecha_hasta'])
    op.create_index('ix_tarifas_calendario_prioridad', 'tarifas_calendario', ['prioridad'])

    op.create_table(
        'descuentos_duracion',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=120), nullable=False),
        sa.Column('categoria_id', sa.Integer(), nullable=True),
        sa.Column('dias_desde', sa.Integer(), nullable=False),
        # NULL = sin tope ("30 dias o mas").
        sa.Column('dias_hasta', sa.Integer(), nullable=True),
        sa.Column('porcentaje', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_por', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['categoria_id'], ['categorias.id']),
        sa.ForeignKeyConstraint(['creado_por'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_descuentos_duracion_id', 'descuentos_duracion', ['id'])
    op.create_index('ix_descuentos_duracion_categoria_id', 'descuentos_duracion', ['categoria_id'])


def downgrade() -> None:
    op.drop_table('descuentos_duracion')
    op.drop_table('tarifas_calendario')
    canal_tarifa_calendario.drop(op.get_bind(), checkfirst=True)
