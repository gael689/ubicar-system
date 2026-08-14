"""063 - La ventana de venta online pasa a ser configuracion (D-52)

Plan de conexion (13/08). Antes eran dos constantes en el router
(`ANTICIPACION_MINIMA_HORAS = 72`, `DURACION_MAXIMA_DIAS = 90`) y no habia
tope de horizonte -- se podia reservar para dentro de dos anios.

Franco decidio el 13/08: la web vende de **10 dias** de anticipacion a **4
meses** de horizonte. La duracion maxima **no cambia**, sigue en 90 dias --
los "10 dias" son anticipacion, no duracion.

Van a `configuracion` y no a constantes porque son palancas comerciales:
Franco las va a querer mover por temporada, y eso no puede requerir un
deploy. Mismo criterio que `web.hold_minutos` (migracion 048) y
`disponibilidad.margen_rotacion_horas` (migracion 061).

Es idempotente: no pisa ningun valor ya cargado.

Revision ID: 063_ventana_web_configuracion
Revises: 062_autoresoluble_y_acuse
"""
import sqlalchemy as sa
from alembic import op

revision = "063_ventana_web_configuracion"
down_revision = "062_autoresoluble_y_acuse"
branch_labels = None
depends_on = None


VALORES = [
    (
        "web.anticipacion_minima_horas", "240", "int",
        "10 dias de anticipacion minima para reservar online (D-52, reemplaza "
        "D-50). Menos que esto, la web deriva a un agente comercial por "
        "WhatsApp en vez de dejar reservar.",
    ),
    (
        "web.horizonte_maximo_dias", "120", "int",
        "4 meses de horizonte maximo para reservar online (D-52). Mas lejos "
        "que esto, la web deriva a un agente comercial por WhatsApp.",
    ),
    (
        "web.duracion_maxima_dias", "90", "int",
        "Duracion maxima de un alquiler reservado online. No cambio con D-52 "
        "-- los 10 dias de la decision son de anticipacion, no de duracion.",
    ),
]


def upgrade() -> None:
    for clave, valor, tipo, descripcion in VALORES:
        op.get_bind().execute(
            sa.text("""
                INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
                VALUES (:clave, :valor, :tipo, 'Reservas web', :descripcion)
                ON CONFLICT (clave) DO NOTHING
            """),
            {"clave": clave, "valor": valor, "tipo": tipo, "descripcion": descripcion},
        )


def downgrade() -> None:
    claves = [v[0] for v in VALORES]
    op.get_bind().execute(
        sa.text("DELETE FROM configuracion WHERE clave = ANY(:claves)"),
        {"claves": claves},
    )
