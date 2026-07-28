"""042_reserva_por_categoria

Reserva por categoria (Fase 5, item 58) + categoria con datos de presentacion.

Es el cambio estructural del que cuelga toda la web: el cliente reserva una
CATEGORIA y el auto puntual se asigna al entregar, que es como funcionan las
rentadoras reales — si un auto se rompe, se reemplaza sin tocar la reserva.

`reservas.vehiculo_id` pasa a NULLABLE y se suma `categoria_id`. La invariante
"al menos uno de los dos" se valida en ReservaService y no con un CHECK de
base, para poder dar un mensaje de error util.

Las reservas existentes NO se tocan: todas tienen vehiculo_id y siguen
funcionando igual. De hecho se les completa `categoria_id` con la categoria
del vehiculo que tienen asignado, para que los reportes por categoria las
incluyan desde el dia uno.

Ademas, `categorias` suma los campos de presentacion (foto, pasajeros,
valijas, transmision, aire, modelos de ejemplo, visible_web) porque la
categoria pasa a ser la unidad de venta de la web: es lo que se muestra en la
grilla de disponibilidad, antes de que exista un auto asignado.

Revision ID: 042_reserva_por_categoria
Revises: 041_bloqueos_vehiculo
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa


revision = '042_reserva_por_categoria'
down_revision = '041_bloqueos_vehiculo'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Reserva por categoria ────────────────────────────────────────────
    op.alter_column('reservas', 'vehiculo_id', existing_type=sa.Integer(), nullable=True)
    op.add_column('reservas', sa.Column('categoria_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_reservas_categoria_id', 'reservas', 'categorias', ['categoria_id'], ['id']
    )
    op.create_index('ix_reservas_categoria_id', 'reservas', ['categoria_id'])

    # Backfill: cada reserva existente hereda la categoria de su vehiculo.
    # Sin esto, un reporte por categoria mostraria cero historia el primer dia.
    # Los vehiculos sin categoria asignada quedan en NULL, que es correcto:
    # no se inventa una.
    op.execute("""
        UPDATE reservas r
        SET categoria_id = v.categoria_id
        FROM vehiculos v
        WHERE r.vehiculo_id = v.id AND v.categoria_id IS NOT NULL
    """)

    # ── Categoria como unidad de venta de la web ─────────────────────────
    op.add_column('categorias', sa.Column('foto_key', sa.String(length=255), nullable=True))
    op.add_column('categorias', sa.Column('pasajeros', sa.Integer(), nullable=True))
    op.add_column('categorias', sa.Column('valijas', sa.Integer(), nullable=True))
    op.add_column('categorias', sa.Column('transmision', sa.String(length=20), nullable=True))
    op.add_column('categorias', sa.Column(
        'aire_acondicionado', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('categorias', sa.Column('ejemplo_modelos', sa.String(length=200), nullable=True))
    op.add_column('categorias', sa.Column(
        'visible_web', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('categorias', 'visible_web')
    op.drop_column('categorias', 'ejemplo_modelos')
    op.drop_column('categorias', 'aire_acondicionado')
    op.drop_column('categorias', 'transmision')
    op.drop_column('categorias', 'valijas')
    op.drop_column('categorias', 'pasajeros')
    op.drop_column('categorias', 'foto_key')

    op.drop_index('ix_reservas_categoria_id', table_name='reservas')
    op.drop_constraint('fk_reservas_categoria_id', 'reservas', type_='foreignkey')
    op.drop_column('reservas', 'categoria_id')
    # Ojo: si hay reservas por categoria sin vehiculo, este downgrade falla.
    # Es correcto que falle — volver atras perderia informacion.
    op.alter_column('reservas', 'vehiculo_id', existing_type=sa.Integer(), nullable=False)
