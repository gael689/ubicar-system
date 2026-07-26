"""027_sena_checkout_tardio

Política de seña en cancelación (D-11) + "late check-out" en vez de un
estado NO_SHOW (D-17 — decidido explícitamente NO crear ese estado:
"Distinguir si la culpa fue del cliente o nuestra es hilar demasiado fino
para el volumen actual"). El roadmap original (PLAN_MAESTRO ítem 23)
mencionaba NO_SHOW como estado nuevo — quedó desactualizado respecto de la
decisión real tomada después; esta migración implementa lo que sí se
decidió, no lo que decía el borrador viejo.

`reservas.motivo_cancelacion`: obligatorio en el service al cancelar (D-11).

`alquileres.cargo_checkout_tardio` / `motivo_checkout_tardio`: si el auto
sale más tarde de lo previsto (reserva.fecha_inicio/hora_inicio vs el
checkout real), monto editable + nota obligatoria de motivo — mismo patrón
que `cargo_late_checkout` que ya existe para la devolución tardía, pero
para la entrega.

reservas y alquileres tenían algunas filas al momento de escribir esta
migración, todas con estos campos NULL/0 por default — no rompe nada
existente.

Revision ID: 027_sena_checkout_tardio
Revises: 026_descuentos_factura
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '027_sena_checkout_tardio'
down_revision = '026_descuentos_factura'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reservas', sa.Column('motivo_cancelacion', sa.Text(), nullable=True))
    op.add_column('alquileres', sa.Column('cargo_checkout_tardio', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('alquileres', sa.Column('motivo_checkout_tardio', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('alquileres', 'motivo_checkout_tardio')
    op.drop_column('alquileres', 'cargo_checkout_tardio')
    op.drop_column('reservas', 'motivo_cancelacion')
