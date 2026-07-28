"""040_adicionales

Adicionales: coberturas y extras que se suman a un alquiler
(Fase 5, item 56 — plan §7.4).

Los cargan los duenos con su precio, por eso es un ABM y no un enum en el
codigo: la lista no esta cerrada y cambia con la temporada.

Dos grupos con reglas de seleccion distintas:
- `cobertura`: se elige UNA (basica / intermedia / full). Son niveles del
  mismo seguro, no complementos.
- `extra`: se eligen las que se quiera (cadenas, GPS, silla de bebe...).

`reserva_adicionales` CONGELA el precio al contratarse: si manana suben el
precio de la cobertura full, las reservas ya cargadas siguen valiendo lo que
se pacto. Mismo criterio que `reservas.precio_lista`.

NO se siembra ningun adicional: la lista y los precios los cargan Franco y
Martin desde la pantalla.

Revision ID: 040_adicionales
Revises: 039_motor_precios
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '040_adicionales'
down_revision = '039_motor_precios'
branch_labels = None
depends_on = None


grupo_adicional = sa.Enum('cobertura', 'extra', name='grupo_adicional')
unidad_cobro_adicional = sa.Enum('por_dia', 'unico', name='unidad_cobro_adicional')


def upgrade() -> None:
    bind = op.get_bind()
    grupo_adicional.create(bind, checkfirst=True)
    unidad_cobro_adicional.create(bind, checkfirst=True)

    op.create_table(
        'adicionales',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('codigo', sa.String(length=40), nullable=False),
        sa.Column('nombre', sa.String(length=120), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        # postgresql.ENUM(create_type=False), NO sa.Enum: sa.Enum ignora
        # create_type e intenta recrear el tipo, y la migracion revienta.
        sa.Column('grupo', postgresql.ENUM(name='grupo_adicional', create_type=False),
                  nullable=False, server_default='extra'),
        sa.Column('precio', sa.Numeric(precision=12, scale=2), nullable=False,
                  server_default='0'),
        sa.Column('unidad_cobro',
                  postgresql.ENUM(name='unidad_cobro_adicional', create_type=False),
                  nullable=False, server_default='por_dia'),
        sa.Column('incluido', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('franquicia', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('max_cantidad', sa.Integer(), nullable=True),
        sa.Column('visible_web', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_por', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['creado_por'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo'),
    )
    op.create_index('ix_adicionales_id', 'adicionales', ['id'])
    op.create_index('ix_adicionales_grupo', 'adicionales', ['grupo'])

    op.create_table(
        'reserva_adicionales',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reserva_id', sa.Integer(), nullable=False),
        sa.Column('adicional_id', sa.Integer(), nullable=False),
        sa.Column('cantidad', sa.Integer(), nullable=False, server_default='1'),
        # Congelados al contratar — ver docstring del modulo.
        sa.Column('precio_unitario', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('unidad_cobro',
                  postgresql.ENUM(name='unidad_cobro_adicional', create_type=False),
                  nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['reserva_id'], ['reservas.id']),
        sa.ForeignKeyConstraint(['adicional_id'], ['adicionales.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_reserva_adicionales_id', 'reserva_adicionales', ['id'])
    op.create_index('ix_reserva_adicionales_reserva_id', 'reserva_adicionales', ['reserva_id'])
    op.create_index('ix_reserva_adicionales_adicional_id', 'reserva_adicionales', ['adicional_id'])


def downgrade() -> None:
    op.drop_table('reserva_adicionales')
    op.drop_table('adicionales')
    bind = op.get_bind()
    unidad_cobro_adicional.drop(bind, checkfirst=True)
    grupo_adicional.drop(bind, checkfirst=True)
