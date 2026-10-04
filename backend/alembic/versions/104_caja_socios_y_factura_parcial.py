"""Caja con socios, repartos, cuenta propia y factura parcial

Pedido de Franco (04/10/2026, planilla `Ubicar_Rent.xlsx`):

- `reservas.monto_facturado`: la parte del total que va con factura. El resto es
  "caja". NULL = reserva anterior: vale `con_factura` (todo o nada).
- `socios`: quién cobra y con qué porcentaje (Franco 50, Martín 50, Ramiro 0).
- `pagos.socio_id`: a nombre de quién quedó el cobro. `pagos.reparto_id`: en qué
  reparto mensual entró.
- `repartos`: el cierre de cada mes.
- `movimientos_propios`: la cuenta propia de cada usuario (privada).

Todo aditivo. Los socios se cargan por nombre; el vínculo con cada usuario se
hace desde la pantalla.

Revision ID: 104_caja_socios
Revises: 103_prospectos
"""
from alembic import op
import sqlalchemy as sa

revision = "104_caja_socios"
down_revision = "103_prospectos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservas", sa.Column("monto_facturado", sa.Numeric(12, 2), nullable=True))

    op.create_table(
        "socios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(80), nullable=False),
        sa.Column("porcentaje", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True, unique=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.execute(
        "INSERT INTO socios (nombre, porcentaje) VALUES "
        "('Franco Marchese', 50), ('Martín González', 50), ('Ramiro Rodríguez', 0)"
    )

    op.create_table(
        "repartos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mes", sa.Date(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("total_cobrado", sa.Numeric(14, 2), nullable=False),
        sa.Column("distribuible", sa.Numeric(14, 2), nullable=False),
        sa.Column("transferencias", sa.JSON(), nullable=False),
        sa.Column("porcentajes", sa.JSON(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("creado_por", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("anulado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("anulado_en", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_repartos_mes", "repartos", ["mes"])
    op.create_index("ix_repartos_anulado", "repartos", ["anulado"])

    op.add_column("pagos", sa.Column("socio_id", sa.Integer(), sa.ForeignKey("socios.id"), nullable=True))
    op.add_column("pagos", sa.Column("reparto_id", sa.Integer(), sa.ForeignKey("repartos.id"), nullable=True))
    op.create_index("ix_pagos_socio_id", "pagos", ["socio_id"])
    op.create_index("ix_pagos_reparto_id", "pagos", ["reparto_id"])

    op.create_table(
        "movimientos_propios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("concepto", sa.String(200), nullable=False),
        sa.Column("tipo", sa.String(8), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("medio", sa.String(30), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("anulado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_movimientos_propios_usuario_id", "movimientos_propios", ["usuario_id"])
    op.create_index("ix_movimientos_propios_fecha", "movimientos_propios", ["fecha"])


def downgrade() -> None:
    op.drop_table("movimientos_propios")
    op.drop_index("ix_pagos_reparto_id", table_name="pagos")
    op.drop_index("ix_pagos_socio_id", table_name="pagos")
    op.drop_column("pagos", "reparto_id")
    op.drop_column("pagos", "socio_id")
    op.drop_table("repartos")
    op.drop_table("socios")
    op.drop_column("reservas", "monto_facturado")
