"""034_echeq_reserva

Conecta Echeqs con la reserva: hoy elegir "echeq" como medio de pago al
cargar una reserva no crea ningún registro `Echeq`, no pide banco/número/
fecha de cobro, y la ficha del cliente no muestra sus echeqs. El modelo ya
tenía todo lo necesario para el vínculo con el cliente y la cuenta corriente
(ver `docs/PLAN_MAESTRO.md` — Echeqs documentado como "isla") — el gap era
100% de flujo/UI.

- `reservas` suma `echeq_banco`/`echeq_numero_cheque`/`echeq_fecha_cobro`
  (el borrador que se carga, o no, al hacer la reserva).
- `echeqs` suma `reserva_id` (nullable) — al crear la reserva todavía no
  existe el `Alquiler`, así que no se puede usar `alquiler_id` como vínculo
  inicial (se completa después, en el checkout — mismo patrón que ya usa
  `movimientos_cuenta_corriente`, que tiene `reserva_id` y `alquiler_id` a
  la vez).
- `echeqs.banco`, `numero_cheque` y `fecha_cobro` pasan a nullable: un echeq
  creado desde la reserva puede quedar "pendiente de completar" — sin fecha
  de cobro, las reglas de notificación de echeq simplemente no disparan
  todavía (no es un error, mismo criterio que
  `movimientos_cuenta_corriente.fecha_vencimiento`).

Revision ID: 034_echeq_reserva
Revises: 033_condicion_pago_reserva
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa

revision = '034_echeq_reserva'
down_revision = '033_condicion_pago_reserva'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reservas', sa.Column('echeq_banco', sa.String(100), nullable=True))
    op.add_column('reservas', sa.Column('echeq_numero_cheque', sa.String(50), nullable=True))
    op.add_column('reservas', sa.Column('echeq_fecha_cobro', sa.Date(), nullable=True))

    op.add_column('echeqs', sa.Column('reserva_id', sa.Integer(), sa.ForeignKey('reservas.id'), nullable=True))
    op.create_index('ix_echeqs_reserva_id', 'echeqs', ['reserva_id'])

    op.alter_column('echeqs', 'banco', existing_type=sa.String(100), nullable=True)
    op.alter_column('echeqs', 'numero_cheque', existing_type=sa.String(50), nullable=True)
    op.alter_column('echeqs', 'fecha_cobro', existing_type=sa.Date(), nullable=True)


def downgrade() -> None:
    op.alter_column('echeqs', 'fecha_cobro', existing_type=sa.Date(), nullable=False)
    op.alter_column('echeqs', 'numero_cheque', existing_type=sa.String(50), nullable=False)
    op.alter_column('echeqs', 'banco', existing_type=sa.String(100), nullable=False)

    op.drop_index('ix_echeqs_reserva_id', table_name='echeqs')
    op.drop_column('echeqs', 'reserva_id')

    op.drop_column('reservas', 'echeq_fecha_cobro')
    op.drop_column('reservas', 'echeq_numero_cheque')
    op.drop_column('reservas', 'echeq_banco')
