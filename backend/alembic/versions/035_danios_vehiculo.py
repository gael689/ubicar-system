"""035_danios_vehiculo

Parte de daños (Fase 4, ítems 52-53). Hasta ahora el estado del vehículo al
entregar/recibir sólo se registraba como texto libre en
`alquileres.checkout_descripcion`/`checkin_descripcion`, sin estructura: no
había forma de saber qué daño ya estaba antes, cuál apareció durante el
alquiler, ni de valorizarlo contra la garantía.

- `danios`: el daño pertenece al **vehículo** (`vehiculo_id` obligatorio);
  `alquiler_id` es opcional porque un daño puede cargarse fuera de un
  alquiler (`momento="preexistente"`). Los daños no reparados son los que se
  precargan en el próximo check-out.
- `fotos_danio`: guarda `archivo_key` de `IStorage`, igual que `documentos` —
  sirve con almacenamiento local hoy y con R2 cuando se migre.

Nota sobre los Enums: se crean explícitamente con `sa.Enum(...).create()`
antes de usarlos en las tablas, y las columnas los referencian con
`create_type=False`. Postgres falla con "type already exists" si se deja que
`create_table` los cree implícitamente y el tipo aparece más de una vez.

Revision ID: 035_danios_vehiculo
Revises: 034_echeq_reserva
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '035_danios_vehiculo'
down_revision = '034_echeq_reserva'
branch_labels = None
depends_on = None


momento_danio = sa.Enum('checkout', 'checkin', 'preexistente', name='momento_danio')
tipo_danio = sa.Enum(
    'rayon', 'abolladura', 'rotura', 'faltante',
    'cristal', 'tapizado', 'mecanico', 'otro',
    name='tipo_danio',
)
severidad_danio = sa.Enum('leve', 'moderado', 'grave', name='severidad_danio')
responsable_danio = sa.Enum('sin_definir', 'cliente', 'desgaste', 'terceros', name='responsable_danio')
estado_danio = sa.Enum('detectado', 'valorizado', 'imputado', 'reparado', 'bonificado', name='estado_danio')


def upgrade() -> None:
    bind = op.get_bind()
    for enum in (momento_danio, tipo_danio, severidad_danio, responsable_danio, estado_danio):
        enum.create(bind, checkfirst=True)

    op.create_table(
        'danios',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('vehiculo_id', sa.Integer(), sa.ForeignKey('vehiculos.id'), nullable=False),
        sa.Column('alquiler_id', sa.Integer(), sa.ForeignKey('alquileres.id'), nullable=True),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id'), nullable=True),
        sa.Column('momento', postgresql.ENUM(name='momento_danio', create_type=False), nullable=False),
        sa.Column('zona', sa.String(80), nullable=False),
        sa.Column('tipo', postgresql.ENUM(name='tipo_danio', create_type=False), nullable=False),
        sa.Column('severidad', postgresql.ENUM(name='severidad_danio', create_type=False),
                  nullable=False, server_default='leve'),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('fecha_deteccion', sa.Date(), nullable=False),
        sa.Column('costo_estimado', sa.Numeric(12, 2), nullable=True),
        sa.Column('monto_imputado', sa.Numeric(12, 2), nullable=True),
        sa.Column('responsable', postgresql.ENUM(name='responsable_danio', create_type=False),
                  nullable=False, server_default='sin_definir'),
        sa.Column('estado', postgresql.ENUM(name='estado_danio', create_type=False),
                  nullable=False, server_default='detectado'),
        sa.Column('movimiento_cc_id', sa.Integer(),
                  sa.ForeignKey('movimientos_cuenta_corriente.id'), nullable=True),
        sa.Column('motivo_bonificacion', sa.Text(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('registrado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_danios_vehiculo_id', 'danios', ['vehiculo_id'])
    op.create_index('ix_danios_alquiler_id', 'danios', ['alquiler_id'])
    op.create_index('ix_danios_cliente_id', 'danios', ['cliente_id'])

    op.create_table(
        'fotos_danio',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('danio_id', sa.Integer(), sa.ForeignKey('danios.id'), nullable=False),
        sa.Column('archivo_key', sa.String(512), nullable=False),
        sa.Column('descripcion', sa.String(255), nullable=True),
        sa.Column('subida_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_fotos_danio_danio_id', 'fotos_danio', ['danio_id'])

    # Cada origen de un asiento tiene su propia FK en el movimiento (alquiler,
    # pago, echeq, multa, recibo, comprobante) — los daños imputados no son la
    # excepción.
    op.add_column(
        'movimientos_cuenta_corriente',
        sa.Column('danio_id', sa.Integer(), sa.ForeignKey('danios.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('movimientos_cuenta_corriente', 'danio_id')

    op.drop_index('ix_fotos_danio_danio_id', table_name='fotos_danio')
    op.drop_table('fotos_danio')

    op.drop_index('ix_danios_cliente_id', table_name='danios')
    op.drop_index('ix_danios_alquiler_id', table_name='danios')
    op.drop_index('ix_danios_vehiculo_id', table_name='danios')
    op.drop_table('danios')

    bind = op.get_bind()
    for enum in (estado_danio, responsable_danio, severidad_danio, tipo_danio, momento_danio):
        enum.drop(bind, checkfirst=True)
