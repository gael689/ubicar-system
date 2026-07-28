"""045_multa_vencimiento

Fecha de vencimiento de la multa + aviso (D-28).

Hasta aca `Multa` solo tenia `fecha_infraccion`: no habia forma de saber
cuando habia que pagarla. Una multa vencida cuesta mas plata, asi que el dato
que faltaba era justamente el unico que importa para no perderla.

**El descuento por pronto pago NO se modela** (decision explicita): existe en
la realidad, pero mantener plazos y porcentajes que cambian por jurisdiccion y
por anio es mucha estructura para un beneficio que quien paga la multa ya
conoce.

Revision ID: 045_multa_vencimiento
Revises: 044_recargo_edad
"""
from alembic import op
import sqlalchemy as sa


revision = '045_multa_vencimiento'
down_revision = '044_recargo_edad'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable a proposito: muchas multas llegan sin fecha clara, y exigirla
    # impediria cargar la multa — que es lo primero que hay que poder hacer.
    op.add_column('multas', sa.Column('fecha_vencimiento', sa.Date(), nullable=True))
    op.create_index('ix_multas_fecha_vencimiento', 'multas', ['fecha_vencimiento'])

    # Ventana de aviso, editable desde la pantalla de Configuracion. Mismo
    # criterio que el resto de los umbrales del sistema: un numero que el
    # negocio ajusta no vive en el codigo.
    op.execute("""
        INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion, updated_at)
        VALUES (
            'multas.dias_aviso_vencimiento', '7', 'int', 'Multas',
            'Con cuantos dias de anticipacion avisar que una multa esta por vencer',
            NOW()
        )
        ON CONFLICT (clave) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM configuracion WHERE clave = 'multas.dias_aviso_vencimiento'")
    op.drop_index('ix_multas_fecha_vencimiento', table_name='multas')
    op.drop_column('multas', 'fecha_vencimiento')
