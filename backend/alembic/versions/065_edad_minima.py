"""065 - Edad minima para alquilar online (D-51)

Plan de conexion (13/08). **Revierte D-38** ("no hay edad minima, hay
recargo por franja etaria") -- Franco decide que la web rechaza a un
conductor de menos de 21, no solo le recarga el precio. Queda escrito acá y
en DECISIONES.md para que en tres meses nadie "arregle" el minimo leyendo
D-38 a solas.

**El rechazo es de la web, no del mostrador**: ahi sigue habiendo una
persona que puede decidir. El mostrador advierte, no bloquea (sin
implementar todavia -- ver PLAN_CONEXION_Y_LIMPIEZA.md §3.4).

Va a `configuracion` y no a una constante: es un numero de negocio.

Revision ID: 065_edad_minima
Revises: 064_franquicia_por_categoria
"""
import sqlalchemy as sa
from alembic import op

revision = "065_edad_minima"
down_revision = "064_franquicia_por_categoria"
branch_labels = None
depends_on = None

CLAVE = "alquiler.edad_minima"
VALOR = "21"
DESCRIPCION = (
    "Edad minima para reservar online (D-51, revierte D-38). Por debajo de "
    "esto, la web rechaza la reserva en vez de sólo recargar el precio."
)


def upgrade() -> None:
    op.get_bind().execute(
        sa.text("""
            INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
            VALUES (:clave, :valor, 'int', 'Reservas web', :descripcion)
            ON CONFLICT (clave) DO NOTHING
        """),
        {"clave": CLAVE, "valor": VALOR, "descripcion": DESCRIPCION},
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM configuracion WHERE clave = :clave"), {"clave": CLAVE}
    )
