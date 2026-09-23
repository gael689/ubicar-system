"""En la pantalla, el pagaré se llama "garantía"

Pedido del cliente: en el sistema, al pagaré lo llaman *garantía*. Esta
migración sólo toca lo que se **ve** en Configuración: el nombre de la sección
y el texto de las descripciones. Las claves (`pagare.*`), las tablas y el texto
legal del documento no cambian: el instrumento que firma el cliente tiene que
seguir diciendo "pagaré" para valer como tal.

Revision ID: 095_pagare_garantia
Revises: 094_pagare
"""
from alembic import op

revision = "095_pagare_garantia"
down_revision = "094_pagare"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE configuracion SET categoria = 'Garantía' WHERE categoria = 'Pagaré'")
    op.execute(
        "UPDATE configuracion SET descripcion = REPLACE(descripcion, 'el pagare', 'la garantia') "
        "WHERE clave LIKE 'pagare.%'"
    )


def downgrade() -> None:
    op.execute("UPDATE configuracion SET categoria = 'Pagaré' WHERE categoria = 'Garantía' AND clave LIKE 'pagare.%'")
    op.execute(
        "UPDATE configuracion SET descripcion = REPLACE(descripcion, 'la garantia', 'el pagare') "
        "WHERE clave LIKE 'pagare.%'"
    )
