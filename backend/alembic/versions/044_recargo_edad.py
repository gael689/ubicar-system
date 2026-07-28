"""044_recargo_edad

Recargo por franja etaria (D-38).

**No hay edad minima.** En vez de rechazar a alguien por su edad, la edad
modifica el precio — que es como opera el rubro (el "young driver surcharge"
de las internacionales). Rechazar pierde la venta entera; recargar la conserva
y cubre el riesgo.

Es un ABM y no una constante en el codigo: los administradores definen las
franjas y el recargo de cada una, igual que hacen con adicionales y con las
reglas de precio. La lista no esta cerrada y va a cambiar.

`reserva_recargo_edad_*` congela lo aplicado, mismo criterio que
`reserva_adicionales.precio` y que `Reserva.precio_lista`: cambiar la tabla de
recargos no puede reescribir lo que ya se pacto.

Revision ID: 044_recargo_edad
Revises: 043_pago_recibo_un_solo_asiento
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '044_recargo_edad'
down_revision = '043_pago_recibo_un_solo_asiento'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'recargos_edad',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('nombre', sa.String(120), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),

        # Franja inclusiva en los dos extremos: 18-24 son siete edades.
        # `edad_hasta` nullable = "de esta edad en adelante", para el recargo
        # a conductores mayores sin tope superior.
        sa.Column('edad_desde', sa.Integer(), nullable=False),
        sa.Column('edad_hasta', sa.Integer(), nullable=True),

        # Monto fijo O porcentaje sobre el alquiler del vehiculo: se carga uno
        # de los dos. Un porcentaje escala solo con el precio del auto (una
        # pick-up recarga mas que un compacto sin cargar dos reglas); un monto
        # fijo es mas facil de comunicar. Los dos casos existen en el rubro.
        sa.Column('monto', sa.Numeric(12, 2), nullable=True),
        sa.Column('porcentaje', sa.Numeric(5, 2), nullable=True),

        # Un recargo por conductor joven se cobra todos los dias que tiene el
        # auto; uno administrativo, una sola vez.
        sa.Column('unidad_cobro',
                  postgresql.ENUM(name='unidad_cobro_adicional', create_type=False),
                  nullable=False, server_default='por_dia'),

        # Alcance: NULL = todas las categorias. Una pick-up para alguien de 19
        # no es el mismo riesgo que un compacto.
        sa.Column('categoria_id', sa.Integer(), sa.ForeignKey('categorias.id'), nullable=True),

        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('creado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
    )
    op.create_index('ix_recargos_edad_franja', 'recargos_edad', ['edad_desde', 'edad_hasta'])

    # Al menos uno de los dos importes, y no los dos a la vez: un recargo con
    # monto y porcentaje juntos no tiene una interpretacion unica.
    op.create_check_constraint(
        'ck_recargos_edad_un_importe',
        'recargos_edad',
        '(monto IS NOT NULL AND porcentaje IS NULL) OR (monto IS NULL AND porcentaje IS NOT NULL)',
    )
    op.create_check_constraint(
        'ck_recargos_edad_franja_valida',
        'recargos_edad',
        'edad_hasta IS NULL OR edad_hasta >= edad_desde',
    )

    # ── Lo aplicado, congelado en la reserva ──────────────────────────────
    op.add_column('reservas', sa.Column('recargo_edad_id', sa.Integer(),
                                        sa.ForeignKey('recargos_edad.id'), nullable=True))
    op.add_column('reservas', sa.Column('recargo_edad_nombre', sa.String(120), nullable=True))
    op.add_column('reservas', sa.Column('recargo_edad_monto', sa.Numeric(12, 2),
                                        nullable=False, server_default='0'))
    # La edad con la que se cotizo. Sin esto no se puede explicar el recargo
    # meses despues, cuando el conductor ya cumplio anios.
    op.add_column('reservas', sa.Column('recargo_edad_edad', sa.Integer(), nullable=True))

    # El recargo mira la edad de QUIEN MANEJA. Si la reserva designa un
    # conductor adicional, el riesgo es el suyo y no el del titular que paga —
    # y hasta ahora de un conductor adicional no se guardaba la fecha de
    # nacimiento, con lo cual su edad era imposible de conocer.
    op.add_column('conductores_adicionales',
                  sa.Column('fecha_nacimiento', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('conductores_adicionales', 'fecha_nacimiento')
    op.drop_column('reservas', 'recargo_edad_edad')
    op.drop_column('reservas', 'recargo_edad_monto')
    op.drop_column('reservas', 'recargo_edad_nombre')
    op.drop_column('reservas', 'recargo_edad_id')
    op.drop_constraint('ck_recargos_edad_franja_valida', 'recargos_edad')
    op.drop_constraint('ck_recargos_edad_un_importe', 'recargos_edad')
    op.drop_index('ix_recargos_edad_franja', table_name='recargos_edad')
    op.drop_table('recargos_edad')
