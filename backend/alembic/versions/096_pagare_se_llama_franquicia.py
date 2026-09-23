"""En pantalla, el pagaré se llama "Franquicia" (y no "garantía")

Pedido del cliente del 23/09/2026: cambia lo que se ve en Configuración, la
sección y las descripciones. Sigue sin tocar las claves (`pagare.*`), las
tablas ni el texto legal del documento.

Revision ID: 096_pagare_franquicia
Revises: 095_pagare_garantia
"""
from alembic import op

revision = "096_pagare_franquicia"
down_revision = "095_pagare_garantia"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE configuracion SET categoria = 'Franquicia' "
        "WHERE clave LIKE 'pagare.%' AND categoria IN ('Pagaré', 'Garantía')"
    )
    op.execute(
        "UPDATE configuracion SET descripcion = REPLACE(REPLACE(descripcion, 'la garantia', 'la franquicia'), 'el pagare', 'la franquicia') "
        "WHERE clave LIKE 'pagare.%'"
    )


def downgrade() -> None:
    op.execute("UPDATE configuracion SET categoria = 'Garantía' WHERE clave LIKE 'pagare.%' AND categoria = 'Franquicia'")
    op.execute(
        "UPDATE configuracion SET descripcion = REPLACE(descripcion, 'la franquicia', 'la garantia') "
        "WHERE clave LIKE 'pagare.%'"
    )
