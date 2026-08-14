"""066 - Los lugares de retiro salen de configuracion (cierra D-10)

Plan de conexion (13/08), punto 3.3. D-10 ya pedia esto en julio: "los
predefinidos se pueden editar y agregar desde Configuracion -- no van
hardcodeados". Seguian hardcodeados en el backend (`routers/public.py`) y
**duplicados** en el front (`web/components/reservar/FlujoReserva.tsx`,
`LUGARES_FALLBACK`) -- dos fuentes de verdad que un dia quedan
desincronizadas.

Se guardan separados por coma, mismo patron que
`notificaciones_digest_destinatarios`.

Revision ID: 066_lugares_retiro_config
Revises: 065_edad_minima
"""
import sqlalchemy as sa
from alembic import op

revision = "066_lugares_retiro_config"
down_revision = "065_edad_minima"
branch_labels = None
depends_on = None

CLAVE = "web.lugares_retiro"
VALOR = "Paraguay 241,Alsina 350,Aeropuerto Comandante Espora"
DESCRIPCION = (
    "Puntos de retiro y devolucion que ofrece la web, separados por coma "
    "(D-10). Sólo Bahía Blanca por ahora (D-39)."
)


def upgrade() -> None:
    op.get_bind().execute(
        sa.text("""
            INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
            VALUES (:clave, :valor, 'string', 'Reservas web', :descripcion)
            ON CONFLICT (clave) DO NOTHING
        """),
        {"clave": CLAVE, "valor": VALOR, "descripcion": DESCRIPCION},
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM configuracion WHERE clave = :clave"), {"clave": CLAVE}
    )
