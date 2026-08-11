"""Wapa como medio de pago propio

Ubicar cobra por Wapa (Banco Patagonia, sobre Prisma + Geopagos): mPOS en el
mostrador, link de pago y QR. Hasta ahora eso se anotaba como "tarjeta" o
"transferencia".

**Por que no alcanza con reusar "tarjeta"**, que es el mismo argumento que hizo
falta para `mercado_pago` en la migracion 051: se concilia contra otro extracto
—el de Banco Patagonia, no el de la terminal— con otras comisiones (4,90%
credito, 2,90% debito, 0,80% QR) y otros plazos de acreditacion. Mezclado con
"tarjeta", la caja del dia cierra pero no se puede saber que se cobro por donde
ni cuanto se fue en comisiones.

**Esto NO es una integracion.** Wapa no expone API publica para comercios ni
webhooks: el cobro se genera desde su app y una persona lo registra aca. Que
sea un medio de pago con nombre propio es justamente lo que lo hace utilizable
sin integracion.

Revision ID: 057_medio_pago_wapa
Revises: 056_firma_por_link
"""
from alembic import op


revision = "057_medio_pago_wapa"
down_revision = "056_firma_por_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE no corre dentro de un bloque transaccional en Postgres < 12;
    # con IF NOT EXISTS ademas es reejecutable sin romper.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE medio_pago ADD VALUE IF NOT EXISTS 'wapa'")


def downgrade() -> None:
    # Postgres no permite quitar valores de un ENUM: 'wapa' queda declarado
    # aunque no se use. Recrear el tipo obligaria a reescribir todas las
    # columnas que lo referencian, y por un valor sin usar no vale la pena.
    pass
