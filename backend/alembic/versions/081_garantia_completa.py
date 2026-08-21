"""La garantía entra a la caja, y sabe desde cuándo está retenida

La garantía **no estaba a medias por falta de campos**: `Alquiler` ya tenía
`garantia_tipo`, `garantia_monto`, `garantia_estado` y `garantia_monto_devuelto`
desde hace meses, y el check-out y el check-in ya los escriben. Lo que faltaba
era otra cosa.

**No entraba a la caja.** Una garantía de $300.000 en efectivo se guardaba en el
cajón y el sistema no lo sabía: al cerrar el día, ese efectivo estaba de más y
nadie podía explicar por qué. Y al devolverla, de menos. Eso lo resuelve la
tabla `movimientos_caja` (migración 080), sin tocar la cuenta corriente — D-27
es explícito: el depósito de garantía **no** genera movimiento en el ledger,
porque no es plata que el cliente deba ni que se le deba, es plata que se
retiene.

Dos columnas nuevas, las dos chicas:

- **`garantia_estado_en`** — cuándo pasó a ese estado. Sin esto, "¿hace cuánto
  que retenemos esta garantía?" sólo se podía contestar mirando la fecha del
  check-in, que es otra cosa: una garantía puede ejecutarse parcialmente
  semanas después.
- **`ejecutada_total`** en el enum de estado. Existía `ejecutada_parcial` y no
  su hermana entera, así que ejecutar la garantía completa había que anotarla
  como parcial con el monto devuelto en cero — un dato que dice lo contrario de
  lo que pasó.

Revision ID: 081_garantia_completa
Revises: 080_movimientos_caja
"""
import sqlalchemy as sa
from alembic import op

revision = "081_garantia_completa"
down_revision = "080_movimientos_caja"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Postgres no deja agregar un valor a un enum dentro de una transacción en
    # versiones viejas; `ALTER TYPE ... ADD VALUE IF NOT EXISTS` sí es seguro
    # desde la 12 y es lo que corre en Railway.
    op.execute("ALTER TYPE estado_garantia ADD VALUE IF NOT EXISTS 'ejecutada_total'")

    op.add_column("alquileres", sa.Column("garantia_estado_en", sa.DateTime, nullable=True))
    # Backfill: para las garantías que ya estaban retenidas, el momento en que
    # pasaron a ese estado es el check-out (es cuando se toman). Para las
    # resueltas, el check-in. No se inventa nada más preciso que eso.
    op.execute(
        "UPDATE alquileres SET garantia_estado_en = "
        "CASE WHEN garantia_estado = 'retenida' "
        "     THEN (checkout_fecha + checkout_hora)::timestamp "
        "     ELSE (checkin_fecha + checkin_hora)::timestamp END "
        "WHERE garantia_estado IS NOT NULL"
    )

    # El movimiento de caja que registró la entrada o la salida de la garantía.
    # Permite llegar del alquiler al asiento y viceversa, y —sobre todo— saber
    # si ya se registró, para no cargarla dos veces.
    op.add_column(
        "alquileres",
        sa.Column(
            "garantia_movimiento_caja_id", sa.Integer,
            sa.ForeignKey("movimientos_caja.id"), nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("alquileres", "garantia_movimiento_caja_id")
    op.drop_column("alquileres", "garantia_estado_en")
    # El valor del enum no se saca: Postgres no soporta DROP VALUE, y sacarlo
    # rompería cualquier fila que lo esté usando.
