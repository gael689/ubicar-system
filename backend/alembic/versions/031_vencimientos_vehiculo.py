"""031_vencimientos_vehiculo

Fase 3, ítem 38 del plan maestro (sección 6.7): VTV y póliza pasan a ser
campos propios del vehículo en vez de vivir sólo como un `Documento`
genérico con `tipo='vtv'/'poliza'`.

Antes, la única forma de saber cuándo vence la VTV de un auto era que
alguien hubiera subido el documento correcto con `vigencia_hasta` cargada
— si nadie lo subió (o lo subió sin esa fecha), el sistema no tenía forma
de saberlo ni de alertar. Ahora es un campo directo del vehículo, editable
sin depender de subir un archivo.

El módulo de Documentos (`Documento`, tipo='vtv'/'poliza') sigue existiendo
para adjuntar el PDF real — no se reemplaza, se complementa: el campo del
vehículo es la fecha que el sistema usa para alertar y filtrar; el
documento adjunto es el respaldo. Se comprobó que hoy no hay ningún
`Documento` de tipo vtv/poliza cargado en la base real, así que no hace
falta backfill.

Revision ID: 031_vencimientos_vehiculo
Revises: 030_notificaciones
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '031_vencimientos_vehiculo'
down_revision = '030_notificaciones'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('vehiculos', sa.Column('vtv_vencimiento', sa.Date(), nullable=True))
    op.add_column('vehiculos', sa.Column('poliza_vencimiento', sa.Date(), nullable=True))
    op.add_column('vehiculos', sa.Column('compania_seguro', sa.String(150), nullable=True))
    op.add_column('vehiculos', sa.Column('nro_poliza', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('vehiculos', 'nro_poliza')
    op.drop_column('vehiculos', 'compania_seguro')
    op.drop_column('vehiculos', 'poliza_vencimiento')
    op.drop_column('vehiculos', 'vtv_vencimiento')
