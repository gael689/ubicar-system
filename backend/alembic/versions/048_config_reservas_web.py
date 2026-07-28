"""Claves de configuración de reservas web que se leían pero no existían

`HoldService` lee `web.hold_minutos` con `get_int(clave, 20)`. Como la clave
nunca se sembró, siempre devolvía el default: el número existía en el código
pero **no se podía cambiar desde la pantalla de Configuración**, que es
justamente donde alguien lo iría a buscar.

Es el peor tipo de configurable: parece que está y no está. Se siembra con el
mismo valor que usa hoy el código, así que el comportamiento no cambia — sólo
pasa a ser editable.

**Va sola.** La tentación era aprovechar y sembrar también
`web.anticipo_porcentaje` y `web.dias_aviso_sin_atender`, pero hoy no las lee
nadie: el anticipo depende de Mercado Pago y el aviso de reserva sin atender
dispara por estado, no por días. Sembrarlas sería volver a crear el problema
que esta migración arregla, sólo que al revés — un campo editable que no
cambia nada.

Revision ID: 048_config_reservas_web
Revises: 047_holds_reservas_web
"""
from alembic import op
import sqlalchemy as sa

revision = "048_config_reservas_web"
down_revision = "047_holds_reservas_web"
branch_labels = None
depends_on = None


CLAVES = [
    (
        "web.hold_minutos",
        "20",
        "int",
        "Reservas web",
        "Minutos que se le reserva el cupo a quien está completando una reserva "
        "en la web antes de liberarlo. Más tiempo da aire para pagar; menos "
        "tiempo libera antes el auto si la persona abandona.",
    ),
]


def upgrade() -> None:
    conf = sa.table(
        "configuracion",
        sa.column("clave", sa.String),
        sa.column("valor", sa.String),
        sa.column("tipo", sa.String),
        sa.column("categoria", sa.String),
        sa.column("descripcion", sa.String),
    )
    conn = op.get_bind()
    for clave, valor, tipo, categoria, desc in CLAVES:
        # Idempotente: si alguien ya la cargó a mano, no le pisamos el valor.
        existe = conn.execute(
            sa.text("SELECT 1 FROM configuracion WHERE clave = :c"), {"c": clave}
        ).first()
        if existe:
            continue
        op.bulk_insert(conf, [{
            "clave": clave, "valor": valor, "tipo": tipo,
            "categoria": categoria, "descripcion": desc,
        }])


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM configuracion WHERE clave = ANY(:claves)"),
        {"claves": [c[0] for c in CLAVES]},
    )
