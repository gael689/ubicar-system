"""Prospectos: se saca el "contactado antes"

Pedido de Gael (14/10/2026): el dato venía del historial de su buscador de
leads —a quién le escribió él—, no de Ubicar, que nunca contactó a nadie. Se
mostraba como etiqueta "Contactado antes" y además dejaba afuera de las
campañas de Ubicar a esas empresas.

Se borran las columnas y los destinatarios que habían quedado omitidos sólo
por ese motivo vuelven a `pendiente`.

Revision ID: 107_prospectos_sin_contacto_previo
Revises: 106_vehiculo_en_web
"""
import sqlalchemy as sa
from alembic import op

revision = "107_prospectos_sin_contacto_previo"
down_revision = "106_vehiculo_en_web"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE campana_destinatarios SET estado = 'pendiente', motivo = NULL "
        "WHERE estado = 'omitido' AND motivo = 'ya fue contactado antes'"
    )
    op.drop_column("prospectos", "contacto_previo_detalle")
    op.drop_column("prospectos", "contacto_previo")
    op.drop_column("campanas_prospecto", "incluir_contacto_previo")


def downgrade() -> None:
    op.add_column("campanas_prospecto", sa.Column(
        "incluir_contacto_previo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("prospectos", sa.Column(
        "contacto_previo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("prospectos", sa.Column("contacto_previo_detalle", sa.String(255), nullable=True))
