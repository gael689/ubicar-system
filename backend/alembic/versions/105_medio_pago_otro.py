"""Otro como medio de pago

La planilla de Franco (04/10/2026) tiene seis medios: Transferencia, eCheq,
Cheque, Tarjeta, Efectivo y **Otro**. Los cinco primeros ya existían; "Otro" es
para lo que no entra en ninguno (un canje, una compensación, un cobro raro).

Cuenta como plata que entró, igual que efectivo o transferencia: no está en
`caja_service.MEDIOS_QUE_NO_SON_PLATA`.

Revision ID: 105_medio_pago_otro
Revises: 104_caja_socios
"""
from alembic import op


revision = "105_medio_pago_otro"
down_revision = "104_caja_socios"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Igual que con 'wapa' (057): ADD VALUE no corre dentro de una transacción
    # en Postgres < 12, y con IF NOT EXISTS se puede volver a correr.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE medio_pago ADD VALUE IF NOT EXISTS 'otro'")


def downgrade() -> None:
    # Postgres no permite quitar valores de un ENUM: 'otro' queda declarado.
    pass
