"""Prospección: casillas en subdominios y el envío de las campañas

Pedido de Gael (21/11/2026): que mandar una campaña sea rápido y que salga de
casillas propias de Ubicar en un subdominio. Hasta acá la campaña se armaba y
se "preparaba", pero el envío no existía.

- `casillas_prospeccion`: desde dónde sale (con su cupo, su rampa y su freno).
- `campana_envios`: un mail por prospecto y por toque, con el texto exacto que
  se mandó y lo que pasó después (entregado, rebotó, queja, respondió).
- `campanas_prospecto`: los seguimientos ya redactados y quién firma.

Aditiva: no toca ninguna fila existente. Los estados son `String`, no ENUM, para
que sumar uno no requiera otra migración.

Revision ID: 109_campanas_envio
Revises: 108_notificacion_datos
"""
import sqlalchemy as sa
from alembic import op

revision = "109_campanas_envio"
down_revision = "108_notificacion_datos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "casillas_prospeccion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("direccion", sa.String(255), nullable=False),
        sa.Column("nombre_visible", sa.String(120), nullable=False),
        sa.Column("responder_a", sa.String(255), nullable=True),
        sa.Column("limite_dia", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("rampa_desde", sa.Date(), nullable=True),
        sa.Column("estado", sa.String(12), nullable=False, server_default="inactiva"),
        sa.Column("motivo_estado", sa.String(255), nullable=True),
        sa.Column("salud_desde", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("proximo_envio_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("direccion", name="uq_casillas_prospeccion_direccion"),
    )
    op.create_index("ix_casillas_prospeccion_estado", "casillas_prospeccion", ["estado"])

    op.add_column("campanas_prospecto", sa.Column("seguimientos", sa.JSON(), nullable=True))
    op.add_column("campanas_prospecto", sa.Column("firma_nombre", sa.String(80), nullable=True))
    op.add_column("campanas_prospecto", sa.Column("firma_telefono", sa.String(40), nullable=True))

    op.create_table(
        "campana_envios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campana_id", sa.Integer(),
                  sa.ForeignKey("campanas_prospecto.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prospecto_id", sa.Integer(), sa.ForeignKey("prospectos.id"), nullable=False),
        sa.Column("toque", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("casilla_id", sa.Integer(),
                  sa.ForeignKey("casillas_prospeccion.id", ondelete="SET NULL"), nullable=True),
        sa.Column("desde", sa.String(255), nullable=True),
        sa.Column("para", sa.String(255), nullable=False),
        sa.Column("asunto", sa.String(200), nullable=False),
        sa.Column("cuerpo", sa.Text(), nullable=False),
        sa.Column("programado_para", sa.DateTime(), nullable=False),
        sa.Column("estado", sa.String(12), nullable=False, server_default="en_cola"),
        sa.Column("motivo", sa.String(255), nullable=True),
        sa.Column("proveedor_id", sa.String(80), nullable=True),
        sa.Column("simulado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("intentos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tomado_at", sa.DateTime(), nullable=True),
        sa.Column("enviado_at", sa.DateTime(), nullable=True),
        sa.Column("entregado_at", sa.DateTime(), nullable=True),
        sa.Column("rebotado_at", sa.DateTime(), nullable=True),
        sa.Column("rebote_duro", sa.Boolean(), nullable=True),
        sa.Column("queja_at", sa.DateTime(), nullable=True),
        sa.Column("respondio_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("campana_id", "prospecto_id", "toque", name="uq_campana_envio_toque"),
    )
    for columna in ("campana_id", "prospecto_id", "casilla_id", "programado_para", "estado",
                    "proveedor_id", "enviado_at"):
        op.create_index(f"ix_campana_envios_{columna}", "campana_envios", [columna])


def downgrade() -> None:
    op.drop_table("campana_envios")
    op.drop_column("campanas_prospecto", "firma_telefono")
    op.drop_column("campanas_prospecto", "firma_nombre")
    op.drop_column("campanas_prospecto", "seguimientos")
    op.drop_table("casillas_prospeccion")
