"""029_comprobantes

Módulo Comprobantes/Facturas (Fase 1, sección 3.5 del plan maestro). D-05:
NO entra facturación electrónica AFIP en esta etapa — se cargan manualmente
con su PDF adjunto. Campos `cae`/`cae_vencimiento` quedan preparados, sin
usar, para no migrar después si se integra AFIP/ARCA más adelante.

`numero`/`punto_venta` son de carga manual (lo que diga el papel/PDF real
emitido fuera del sistema) — a diferencia de `recibos`, que sí tiene
numeración propia vía secuencia porque no es un comprobante fiscal externo.

`tipo` no incluye "recibo": el módulo de Recibos ya es una tabla aparte con
su propio pipeline (numeración + PDF + ledger) — incluirlo acá duplicaría
sin necesidad.

Sólo `nota_credito`/`nota_debito` generan un movimiento nuevo en la cuenta
corriente (ajustes reales posteriores a la venta). `factura_a/b/c` y
`remito` documentan un cargo que el ledger completo ya facturó
automáticamente al checkout — no generan un segundo asiento.

Revision ID: 029_comprobantes
Revises: 028_cargos_cierre
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '029_comprobantes'
down_revision = '028_cargos_cierre'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE tipo_comprobante AS ENUM ('factura_a', 'factura_b', 'factura_c', 'nota_credito', 'nota_debito', 'remito')")
    op.execute("CREATE TYPE estado_comprobante AS ENUM ('emitida', 'anulada', 'cobrada')")

    op.create_table(
        'comprobantes',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tipo', postgresql.ENUM(name='tipo_comprobante', create_type=False), nullable=False),
        sa.Column('punto_venta', sa.String(10), nullable=True),
        sa.Column('numero', sa.String(30), nullable=False),
        sa.Column('fecha_emision', sa.Date(), nullable=False),
        sa.Column('fecha_vencimiento', sa.Date(), nullable=True),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id'), nullable=False),
        sa.Column('alquiler_id', sa.Integer(), sa.ForeignKey('alquileres.id'), nullable=True),
        sa.Column('reserva_id', sa.Integer(), sa.ForeignKey('reservas.id'), nullable=True),
        sa.Column('neto', sa.Numeric(12, 2), nullable=True),
        sa.Column('iva', sa.Numeric(12, 2), nullable=True),
        sa.Column('total', sa.Numeric(12, 2), nullable=False),
        sa.Column('cae', sa.String(20), nullable=True),
        sa.Column('cae_vencimiento', sa.Date(), nullable=True),
        sa.Column('archivo_key', sa.String(512), nullable=False),
        sa.Column('estado', postgresql.ENUM(name='estado_comprobante', create_type=False), nullable=False, server_default='emitida'),
        sa.Column('motivo_anulacion', sa.Text(), nullable=True),
        sa.Column('movimiento_cc_id', sa.Integer(), sa.ForeignKey('movimientos_cuenta_corriente.id'), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_comprobantes_cliente_id', 'comprobantes', ['cliente_id'])

    op.add_column(
        'movimientos_cuenta_corriente',
        sa.Column('comprobante_id', sa.Integer(), sa.ForeignKey('comprobantes.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('movimientos_cuenta_corriente', 'comprobante_id')
    op.drop_table('comprobantes')
    op.execute("DROP TYPE estado_comprobante")
    op.execute("DROP TYPE tipo_comprobante")
