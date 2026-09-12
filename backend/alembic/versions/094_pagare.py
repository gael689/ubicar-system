"""El pagaré a la vista, aparte del contrato y firmado con la misma firma

Pedido de Ubicar (12/09/2026): un documento nuevo que se genera junto con el
contrato, viaja en el mismo link y se firma en el mismo acto. Ver
`app/models/pagare.py` y `app/domain/pagare_texto.py`.

Además de la tabla, siembra la configuración que el texto necesita. **Las dos
tasas arrancan vacías a propósito**: el Decreto-Ley 5965/63 (art. 5) exige
que la tasa figure en el documento, y no hay un valor "razonable por defecto"
que el sistema pueda inventar en nombre del dueño. Mientras estén vacías, el
pagaré no se genera y la pantalla dice dónde cargarlas.

Revision ID: 094_pagare
Revises: 093_sena_del_alta
"""
from alembic import op
import sqlalchemy as sa


revision = "094_pagare"
down_revision = "093_sena_del_alta"
branch_labels = None
depends_on = None


CONFIG = [
    ("pagare.interes_compensatorio_anual", "", "string",
     "Tasa del interes compensatorio anual vencido que se imprime en el pagare. "
     "Ej: 60% (sesenta por ciento). Sin cargar, el pagare no se genera"),
    ("pagare.interes_punitorio_anual", "", "string",
     "Tasa del interes punitorio anual vencido que se imprime en el pagare. "
     "Ej: 30% (treinta por ciento). Sin cargar, el pagare no se genera"),
    ("pagare.lugar_emision", "Bahía Blanca", "string",
     "Ciudad que encabeza el pagare: 'Bahia Blanca, 12 de septiembre de 2026'"),
    ("pagare.lugar_pago", "", "string",
     "Donde es pagadero. Vacio: el domicilio de la empresa (Empresa > domicilio y localidad)"),
]


def upgrade() -> None:
    op.create_table(
        "pagares",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reserva_id", sa.Integer(), sa.ForeignKey("reservas.id"), nullable=False),
        sa.Column("contrato_id", sa.Integer(), sa.ForeignKey("contratos.id"), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("firmado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("firmado_at", sa.DateTime(), nullable=True),
        sa.Column("firma_key", sa.String(512), nullable=True),
        sa.Column("firma_medio", sa.String(10), nullable=True),
        sa.Column("firmado_por_nombre", sa.String(255), nullable=True),
        sa.Column("firmado_por_dni", sa.String(20), nullable=True),
        sa.Column("firma_ip", sa.String(45), nullable=True),
        sa.Column("firma_user_agent", sa.String(255), nullable=True),
        sa.Column("firma_aceptacion", sa.JSON(), nullable=True),
        sa.Column("firmas_codeudores", sa.JSON(), nullable=True),
        sa.Column("escaneo_key", sa.String(512), nullable=True),
        sa.Column("anulado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("motivo_anulacion", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_por", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("fecha_generacion", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_pagares_id", "pagares", ["id"])
    op.create_index("ix_pagares_reserva_id", "pagares", ["reserva_id"])
    op.create_index("ix_pagares_contrato_id", "pagares", ["contrato_id"])

    conn = op.get_bind()
    for clave, valor, tipo, descripcion in CONFIG:
        conn.execute(sa.text("""
            INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion, updated_at)
            VALUES (:clave, :valor, :tipo, 'Pagaré', :descripcion, NOW())
            ON CONFLICT (clave) DO NOTHING
        """).bindparams(clave=clave, valor=valor, tipo=tipo, descripcion=descripcion))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM configuracion WHERE clave LIKE 'pagare.%'"))
    op.drop_index("ix_pagares_contrato_id", table_name="pagares")
    op.drop_index("ix_pagares_reserva_id", table_name="pagares")
    op.drop_index("ix_pagares_id", table_name="pagares")
    op.drop_table("pagares")
