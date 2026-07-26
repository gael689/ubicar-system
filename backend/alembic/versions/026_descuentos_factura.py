"""026_descuentos_factura

Descuentos auditados + con/sin factura en la reserva (Fase 1, ítem 22).

`precio_lista` guarda el precio que salió de la tarifa (vehículo/categoría/
general) SIEMPRE que haya una tarifa configurada, incluso si el operador
carga un `precio_total` manual distinto — es lo que permite comparar
"precio de lista vs cobrado" después. Si difieren, el service exige
`descuento_motivo` y registra `descuento_autorizado_por` (el usuario que
hizo la reserva — no hay todavía un esquema de roles/autorización jerárquica
más fino).

`con_factura` es la declaración de la reserva completa (a diferencia de
`Pago.con_factura`, que es por cobro individual — RES-14).

reservas tenía algunas filas al momento de escribir esta migración, todas
con estos campos NULL/False por default — no rompe nada existente.

Revision ID: 026_descuentos_factura
Revises: 025_categorias
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '026_descuentos_factura'
down_revision = '025_categorias'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reservas', sa.Column('precio_lista', sa.Numeric(12, 2), nullable=True))
    op.add_column('reservas', sa.Column('descuento_motivo', sa.Text(), nullable=True))
    op.add_column('reservas', sa.Column('descuento_autorizado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True))
    op.add_column('reservas', sa.Column('con_factura', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('reservas', 'con_factura')
    op.drop_column('reservas', 'descuento_autorizado_por')
    op.drop_column('reservas', 'descuento_motivo')
    op.drop_column('reservas', 'precio_lista')
