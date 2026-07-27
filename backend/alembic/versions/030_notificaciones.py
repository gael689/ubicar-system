"""030_notificaciones

Fase 2 del plan maestro (sección 4): motor completo de Alertas y
Notificaciones, unificando `services/alertas.py` (huérfano, nunca conectado)
y el router `notificaciones.py` (computaba todo on-demand, sin historial).

Tabla `notificaciones`: la pieza central. `clave_dedupe` es UNIQUE
(`{tipo}:{entidad_tipo}:{entidad_id}:{fecha_objetivo}`) — evita que la misma
alerta se recree en cada corrida del motor. `estado` habilita leído /
posponer / descartar / auto-resolución, algo que el sistema anterior no
podía hacer porque no persistía nada.

Tabla `preferencias_notificacion`: por usuario + tipo de regla, qué canales
y con qué anticipación (T-N días). Vacía = usa el default de la regla.
Queda preparada para cuando haya usuarios reales por Clerk (Fase 3.5); hoy
sólo existe el admin de dev_bypass_auth.

Además, dos columnas nuevas para poder implementar el catálogo completo de
4.2 sin inventar fechas:
- `multas.fecha_imputada`: cuándo pasó a estado "imputada" (regla "imputada
  sin cobrar > 15 días" la necesita; antes no se registraba en ningún lado).
- `vehiculos.estado_desde`: cuándo entró al estado actual (regla "fuera de
  servicio > 7 días" la necesita).

Revision ID: 030_notificaciones
Revises: 029_comprobantes
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '030_notificaciones'
down_revision = '029_comprobantes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE urgencia_notificacion AS ENUM ('critica', 'alta', 'media', 'baja')"
    )
    op.execute(
        "CREATE TYPE estado_notificacion AS ENUM "
        "('pendiente', 'enviada', 'leida', 'pospuesta', 'descartada', 'resuelta')"
    )

    op.create_table(
        'notificaciones',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tipo', sa.String(60), nullable=False),
        sa.Column('titulo', sa.String(255), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=False),
        sa.Column('urgencia', postgresql.ENUM(name='urgencia_notificacion', create_type=False), nullable=False),
        sa.Column('entidad_tipo', sa.String(30), nullable=False),
        sa.Column('entidad_id', sa.Integer(), nullable=False),
        sa.Column('url_destino', sa.String(255), nullable=False),
        sa.Column('fecha_objetivo', sa.Date(), nullable=True),
        sa.Column('programada_para', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column(
            'estado', postgresql.ENUM(name='estado_notificacion', create_type=False),
            nullable=False, server_default='pendiente',
        ),
        sa.Column('destinatario_usuario_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('canales_enviados', postgresql.JSON(), nullable=True),
        sa.Column('clave_dedupe', sa.String(150), nullable=False),
        sa.Column('posponer_hasta', sa.DateTime(), nullable=True),
        sa.Column('leida_at', sa.DateTime(), nullable=True),
        sa.Column('resuelta_at', sa.DateTime(), nullable=True),
        sa.Column('resuelta_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_unique_constraint('uq_notificaciones_clave_dedupe', 'notificaciones', ['clave_dedupe'])
    op.create_index('ix_notificaciones_estado', 'notificaciones', ['estado'])
    op.create_index('ix_notificaciones_tipo_entidad', 'notificaciones', ['tipo', 'entidad_tipo', 'entidad_id'])

    op.create_table(
        'preferencias_notificacion',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('usuario_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('tipo_regla', sa.String(60), nullable=False),
        sa.Column('canales', postgresql.JSON(), nullable=False, server_default='["in_app"]'),
        sa.Column('anticipacion_dias', sa.Integer(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_unique_constraint(
        'uq_preferencias_usuario_tipo', 'preferencias_notificacion', ['usuario_id', 'tipo_regla']
    )

    op.add_column('multas', sa.Column('fecha_imputada', sa.DateTime(), nullable=True))
    op.add_column(
        'vehiculos',
        sa.Column('estado_desde', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )


def downgrade() -> None:
    op.drop_column('vehiculos', 'estado_desde')
    op.drop_column('multas', 'fecha_imputada')
    op.drop_table('preferencias_notificacion')
    op.drop_table('notificaciones')
    op.execute("DROP TYPE estado_notificacion")
    op.execute("DROP TYPE urgencia_notificacion")
