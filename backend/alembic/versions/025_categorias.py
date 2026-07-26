"""025_categorias

Rediseño de tarifas, primera etapa (Fase 1, ítem 21): categoría como entidad
nueva, para poder tener tarifario por categoría ADEMÁS del ya existente por
vehículo específico (ambos conviven — el específico sigue ganando cuando
existe). Sin calendario/estacionalidad todavía: eso es de la Fase 5 (web),
donde además la reserva pasa a ser por categoría en vez de por vehículo
puntual (`tarifas_calendario` con prioridades, ver docs/PLAN_MAESTRO.md).

Categorías seedeadas con las 6 ya confirmadas por Franco/Martín (ver
docs/DECISIONES.md D-08): compacto, sedán, sedán superior, SUV, pick-up,
furgón. `vehiculos.categoria_id` queda nullable — hay 16 vehículos ya
cargados que hay que categorizar a mano, no se puede inferir.

`tarifas.categoria_id` nullable, mutuamente excluyente con `vehiculo_id` en
la práctica (validado en el service, no con constraint de base): una tarifa
es específica de un vehículo O de una categoría O general (ambos NULL).

Revision ID: 025_categorias
Revises: 024_conductor_reserva
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '025_categorias'
down_revision = '024_conductor_reserva'
branch_labels = None
depends_on = None

# (código, nombre) — D-08 de docs/DECISIONES.md, tal cual confirmado.
CATEGORIAS = [
    ("compacto", "Compacto"),
    ("sedan", "Sedán"),
    ("sedan_superior", "Sedán superior"),
    ("suv", "SUV"),
    ("pickup", "Pick-up"),
    ("furgon", "Furgón"),
]


def upgrade() -> None:
    op.create_table(
        'categorias',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('codigo', sa.String(30), nullable=False, unique=True),
        sa.Column('nombre', sa.String(50), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )

    categorias_table = sa.table(
        'categorias',
        sa.column('codigo', sa.String),
        sa.column('nombre', sa.String),
        sa.column('orden', sa.Integer),
    )
    op.bulk_insert(categorias_table, [
        {"codigo": codigo, "nombre": nombre, "orden": i}
        for i, (codigo, nombre) in enumerate(CATEGORIAS)
    ])

    op.add_column('vehiculos', sa.Column('categoria_id', sa.Integer(), sa.ForeignKey('categorias.id'), nullable=True))
    op.add_column('tarifas', sa.Column('categoria_id', sa.Integer(), sa.ForeignKey('categorias.id'), nullable=True))


def downgrade() -> None:
    op.drop_column('tarifas', 'categoria_id')
    op.drop_column('vehiculos', 'categoria_id')
    op.drop_table('categorias')
