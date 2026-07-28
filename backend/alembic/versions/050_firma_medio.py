"""Cómo se firmó el contrato: en pantalla o en papel

Firmar en papel ya funcionaba —se descarga el PDF, se imprime, el cliente firma
con lapicera y en el sistema se confirma sin dibujar nada— pero **no quedaba
registrado**. Un contrato firmado en papel y uno firmado en pantalla se veían
idénticos: los dos decían "firmado" y ninguno tenía imagen de firma.

Eso importa cuando hay que oponer el contrato. Si el registro dice "firmado" y
no hay trazo, alguien tiene que saber si el papel firmado existe en un cajón o
si se marcó por error.

`pantalla` es el default porque es el camino que ya venían usando los
contratos existentes (todos los que tienen `firma_key`).

Revision ID: 050_firma_medio
Revises: 049_contrato_reserva
"""
from alembic import op
import sqlalchemy as sa

revision = "050_firma_medio"
down_revision = "049_contrato_reserva"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contratos",
        sa.Column("firma_medio", sa.String(10), nullable=True),
    )
    # Backfill: los que ya están firmados con imagen fueron en pantalla; los
    # firmados sin imagen sólo pueden haber sido en papel.
    op.execute("""
        UPDATE contratos
           SET firma_medio = CASE WHEN firma_key IS NOT NULL THEN 'pantalla' ELSE 'papel' END
         WHERE firmado = true
    """)


def downgrade() -> None:
    op.drop_column("contratos", "firma_medio")
