"""047_holds_reservas_web

Holds con expiracion (item 61) + bandeja de reservas web (item 64).

**Por que el hold existe.** Entre que el cliente elige el auto y termina de
pagar pasan minutos. Sin reservar el cupo en ese intervalo, dos personas
compran la ultima unidad y una se queda sin auto el dia que viaja — el caso
feo de la decision #4. El hold es la defensa real contra eso; retener y avisar
es el plan B, no el plan A.

**Expira solo, y eso importa.** Un hold sin expiracion es una reserva
fantasma: alguien abandona el checkout y el auto queda bloqueado para siempre.
No hace falta un job que los limpie — `expira_en` se compara al consultar
disponibilidad, asi que un hold vencido deja de ocupar en el mismo instante
sin que nadie corra nada. El borrado fisico posterior es housekeeping, no
correctitud.

**Estados nuevos de reserva.** `pendiente_pago` (hold tomado, esperando a
Mercado Pago), `sin_disponibilidad` (D-04: se acepta la solicitud sin cupo y
sin cobrar, para no perder el contacto) y `revision_sin_cupo` (decision #4: el
pago entro pero el cupo se fue; una persona resuelve). Ninguno de los tres
ocupa calendario.

Revision ID: 047_holds_reservas_web
Revises: 046_contratos
"""
from alembic import op
import sqlalchemy as sa


revision = '047_holds_reservas_web'
down_revision = '046_contratos'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'holds',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        # Token opaco que maneja la web. No se expone el id: adivinar un
        # entero para liberar el hold de otro seria trivial.
        sa.Column('token', sa.String(64), nullable=False, unique=True, index=True),

        sa.Column('categoria_id', sa.Integer(), sa.ForeignKey('categorias.id'), nullable=False),
        sa.Column('fecha_inicio', sa.Date(), nullable=False),
        sa.Column('hora_inicio', sa.Time(), nullable=False),
        sa.Column('fecha_fin', sa.Date(), nullable=False),
        sa.Column('hora_fin', sa.Time(), nullable=False),

        sa.Column('expira_en', sa.DateTime(), nullable=False, index=True),
        # consumido: el hold cumplio su funcion y la reserva se creo. Se
        # conserva en vez de borrarse para poder medir cuantos se abandonan,
        # que es el dato que dice si la ventana de 20 minutos alcanza.
        sa.Column('estado', sa.Enum('vigente', 'consumido', 'liberado',
                                    name='estado_hold'),
                  nullable=False, server_default='vigente'),
        sa.Column('reserva_id', sa.Integer(), sa.ForeignKey('reservas.id'), nullable=True),

        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    # La consulta caliente es "holds vigentes que solapan este rango".
    op.create_index('ix_holds_vigencia', 'holds', ['estado', 'expira_en', 'categoria_id'])

    # ── Estados nuevos de reserva ─────────────────────────────────────────
    # `reservas.estado` es un Enum de Postgres: hay que agregar los valores.
    for valor in ('pendiente_pago', 'sin_disponibilidad', 'revision_sin_cupo'):
        op.execute(f"ALTER TYPE estado_reserva ADD VALUE IF NOT EXISTS '{valor}'")

    # ── Origen de la reserva ──────────────────────────────────────────────
    # Sin esto no se puede armar la bandeja: una reserva web y una de
    # mostrador son la misma tabla, y hay que poder distinguirlas.
    op.add_column('reservas', sa.Column('origen', sa.String(20), nullable=False,
                                        server_default='mostrador'))
    op.create_index('ix_reservas_origen', 'reservas', ['origen'])

    # Quien acepto o rechazo la solicitud web, y por que.
    op.add_column('reservas', sa.Column('web_resuelta_por', sa.Integer(),
                                        sa.ForeignKey('usuarios.id'), nullable=True))
    op.add_column('reservas', sa.Column('web_resuelta_en', sa.DateTime(), nullable=True))
    op.add_column('reservas', sa.Column('web_motivo_rechazo', sa.Text(), nullable=True))

    # Datos de contacto de quien reservo online. Se guardan en la reserva y no
    # solo en el cliente porque una solicitud SIN_DISPONIBILIDAD puede no
    # llegar nunca a crear un cliente, y ese contacto es justamente lo que se
    # quiere no perder.
    op.add_column('reservas', sa.Column('web_contacto_nombre', sa.String(255), nullable=True))
    op.add_column('reservas', sa.Column('web_contacto_email', sa.String(255), nullable=True))
    op.add_column('reservas', sa.Column('web_contacto_telefono', sa.String(30), nullable=True))


def downgrade() -> None:
    for col in ('web_contacto_telefono', 'web_contacto_email', 'web_contacto_nombre',
                'web_motivo_rechazo', 'web_resuelta_en', 'web_resuelta_por'):
        op.drop_column('reservas', col)
    op.drop_index('ix_reservas_origen', table_name='reservas')
    op.drop_column('reservas', 'origen')

    op.drop_index('ix_holds_vigencia', table_name='holds')
    op.drop_table('holds')
    op.execute("DROP TYPE IF EXISTS estado_hold")
    # Postgres no permite quitar valores de un ENUM: los tres estados nuevos
    # quedan definidos aunque nadie los use. Es inofensivo.
