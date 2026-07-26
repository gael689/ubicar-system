"""023_datos_fiscales_cliente

Datos fiscales del cliente (Fase 1, sección 3.7 del plan maestro) + soporte
para empresas: razon_social, condicion_iva, domicilio/localidad/provincia/
codigo_postal, fecha_nacimiento (particular), licencia_pais/licencia_desde,
condicion_pago_default.

De paso, dos correcciones menores encontradas al tocar este módulo:
- `conductores_adicionales` nunca tenía baja lógica (hard delete real,
  violando la regla "nunca eliminar") — se agrega `activo`.
- Nueva tabla `cliente_contactos` para empresas con más de un contacto
  (cada uno con su puesto), con baja lógica desde el día uno.

clientes tenía 1 fila, conductores_adicionales 0 al momento de escribir
esta migración — riesgo mínimo.

Revision ID: 023_datos_fiscales_cliente
Revises: 022_recibos
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '023_datos_fiscales_cliente'
down_revision = '022_recibos'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE condicion_iva AS ENUM ('responsable_inscripto', 'monotributo', 'consumidor_final', 'exento')")

    op.add_column('clientes', sa.Column('razon_social', sa.String(255), nullable=True))
    op.add_column('clientes', sa.Column('condicion_iva', sa.Enum(
        'responsable_inscripto', 'monotributo', 'consumidor_final', 'exento',
        name='condicion_iva', create_type=False,
    ), nullable=True))
    op.add_column('clientes', sa.Column('domicilio', sa.String(255), nullable=True))
    op.add_column('clientes', sa.Column('localidad', sa.String(100), nullable=True))
    op.add_column('clientes', sa.Column('provincia', sa.String(100), nullable=True))
    op.add_column('clientes', sa.Column('codigo_postal', sa.String(10), nullable=True))
    op.add_column('clientes', sa.Column('fecha_nacimiento', sa.Date(), nullable=True))
    op.add_column('clientes', sa.Column('licencia_pais', sa.String(100), nullable=True))
    op.add_column('clientes', sa.Column('licencia_desde', sa.Date(), nullable=True))
    op.add_column('clientes', sa.Column('condicion_pago_default', sa.String(20), nullable=True))

    op.add_column(
        'conductores_adicionales',
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        'cliente_contactos',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id'), nullable=False, index=True),
        sa.Column('nombre', sa.String(255), nullable=False),
        sa.Column('puesto', sa.String(100), nullable=True),
        sa.Column('telefono', sa.String(30), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )


def downgrade() -> None:
    op.drop_table('cliente_contactos')
    op.drop_column('conductores_adicionales', 'activo')
    op.drop_column('clientes', 'condicion_pago_default')
    op.drop_column('clientes', 'licencia_desde')
    op.drop_column('clientes', 'licencia_pais')
    op.drop_column('clientes', 'fecha_nacimiento')
    op.drop_column('clientes', 'codigo_postal')
    op.drop_column('clientes', 'provincia')
    op.drop_column('clientes', 'localidad')
    op.drop_column('clientes', 'domicilio')
    op.drop_column('clientes', 'condicion_iva')
    op.drop_column('clientes', 'razon_social')
    op.execute("DROP TYPE condicion_iva")
