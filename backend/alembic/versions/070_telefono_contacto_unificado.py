"""070 - Las llamadas van al mismo numero que el WhatsApp

La 069 seedeo `contacto.telefono` con un numero distinto al del WhatsApp.
Gael lo corrigio el 14/08: quien llama en vez de escribir tiene que caer en
la misma linea que atiende las reservas, no en otra.

Va en una migracion propia y no editando la 069 porque esa ya corrio -en
local y en produccion-, asi que cambiarla no tendria ningun efecto.

Actualiza el valor **solo si sigue siendo el que sembro la 069**. Si alguien
ya lo cambio a mano desde Configuracion, se respeta: una migracion no puede
pisar una decision que alguien tomo despues.

Revision ID: 070_telefono_contacto_unificado
Revises: 069_solicitudes_contacto
"""
import sqlalchemy as sa
from alembic import op

revision = "070_telefono_contacto_unificado"
down_revision = "069_solicitudes_contacto"
branch_labels = None
depends_on = None

CLAVE = "contacto.telefono"
VALOR_VIEJO = "+5492923474791"
VALOR_NUEVO = "+5492914180554"


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE configuracion SET valor = :nuevo "
            "WHERE clave = :clave AND valor = :viejo"
        ),
        {"clave": CLAVE, "nuevo": VALOR_NUEVO, "viejo": VALOR_VIEJO},
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE configuracion SET valor = :viejo "
            "WHERE clave = :clave AND valor = :nuevo"
        ),
        {"clave": CLAVE, "nuevo": VALOR_NUEVO, "viejo": VALOR_VIEJO},
    )
