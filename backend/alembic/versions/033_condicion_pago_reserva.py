"""033_condicion_pago_reserva

Condición de pago como decisión de la reserva (no un default silencioso del
cliente), tipo de factura, y rastro de edición manual del vencimiento en el
ledger de cuenta corriente.

`condicion_pago_ancla` no tiene default: la persona que carga la reserva
elige explícitamente 'checkout' / 'checkin' / 'fecha_especifica' cuando la
condición no es 'contado' — ver `ReservaModal.tsx`.

`vencimiento_editado_*` en `movimientos_cuenta_corriente`: cualquier
operador puede corregir a mano la fecha de vencimiento de un débito
(cubre ancla=checkin mientras el auto no volvió, extensiones,
renegociaciones) sin tocar monto ni saldo_posterior — siempre con motivo
obligatorio, ver CuentaCorrienteService.editar_vencimiento().

Revision ID: 033_condicion_pago_reserva
Revises: 032_configuracion
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa

revision = '033_condicion_pago_reserva'
down_revision = '032_configuracion'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reservas', sa.Column('condicion_pago', sa.String(20), nullable=False, server_default='contado'))
    op.add_column('reservas', sa.Column('condicion_pago_ancla', sa.String(20), nullable=True))
    op.add_column('reservas', sa.Column('condicion_pago_fecha_ancla', sa.Date(), nullable=True))
    op.add_column('reservas', sa.Column('tipo_factura', sa.String(1), nullable=True))
    op.add_column('reservas', sa.Column('factura_a_nombre_de', sa.String(255), nullable=True))

    op.add_column('movimientos_cuenta_corriente', sa.Column('vencimiento_editado_motivo', sa.Text(), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('vencimiento_editado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True))
    op.add_column('movimientos_cuenta_corriente', sa.Column('vencimiento_editado_en', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('movimientos_cuenta_corriente', 'vencimiento_editado_en')
    op.drop_column('movimientos_cuenta_corriente', 'vencimiento_editado_por')
    op.drop_column('movimientos_cuenta_corriente', 'vencimiento_editado_motivo')

    op.drop_column('reservas', 'factura_a_nombre_de')
    op.drop_column('reservas', 'tipo_factura')
    op.drop_column('reservas', 'condicion_pago_fecha_ancla')
    op.drop_column('reservas', 'condicion_pago_ancla')
    op.drop_column('reservas', 'condicion_pago')
