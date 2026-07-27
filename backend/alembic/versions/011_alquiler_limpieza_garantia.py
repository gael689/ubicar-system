"""011_alquiler_limpieza_garantia

Agrega a la tabla `alquileres`:
- estado_limpieza (enum): estado del vehículo al momento de checkout/checkin
- garantia_tipo, garantia_monto, garantia_estado, garantia_monto_devuelto

Revision ID: 011_alquiler_limpieza_garantia
Revises: 010_multas
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "011_alquiler_limpieza_garantia"
down_revision = "010_multas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enums nuevos
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE estado_limpieza AS ENUM ('limpio', 'sucio', 'requiere_lavado_profundo');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE tipo_garantia AS ENUM ('efectivo', 'tarjeta', 'transferencia', 'no_aplica');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE estado_garantia AS ENUM ('retenida', 'devuelta', 'ejecutada_parcial');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Campos de limpieza (checkout y checkin)
    op.add_column("alquileres", sa.Column(
        "checkout_estado_limpieza",
        sa.Enum("limpio", "sucio", "requiere_lavado_profundo", name="estado_limpieza", create_type=False),
        nullable=True,
    ))
    op.add_column("alquileres", sa.Column(
        "checkin_estado_limpieza",
        sa.Enum("limpio", "sucio", "requiere_lavado_profundo", name="estado_limpieza", create_type=False),
        nullable=True,
    ))

    # Campos de garantía
    op.add_column("alquileres", sa.Column(
        "garantia_tipo",
        sa.Enum("efectivo", "tarjeta", "transferencia", "no_aplica", name="tipo_garantia", create_type=False),
        nullable=True,
    ))
    op.add_column("alquileres", sa.Column("garantia_monto", sa.Numeric(12, 2), nullable=True))
    op.add_column("alquileres", sa.Column(
        "garantia_estado",
        sa.Enum("retenida", "devuelta", "ejecutada_parcial", name="estado_garantia", create_type=False),
        nullable=True,
    ))
    op.add_column("alquileres", sa.Column("garantia_monto_devuelto", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("alquileres", "garantia_monto_devuelto")
    op.drop_column("alquileres", "garantia_estado")
    op.drop_column("alquileres", "garantia_monto")
    op.drop_column("alquileres", "garantia_tipo")
    op.drop_column("alquileres", "checkin_estado_limpieza")
    op.drop_column("alquileres", "checkout_estado_limpieza")
    op.execute("DROP TYPE IF EXISTS estado_garantia")
    op.execute("DROP TYPE IF EXISTS tipo_garantia")
    op.execute("DROP TYPE IF EXISTS estado_limpieza")
