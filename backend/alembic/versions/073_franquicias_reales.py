"""Franquicias reales de SUV, Pick-up y Furgón.

Fase 5 de la reestructuración, con los valores confirmados el 20/08/2026.

La migración 064 sembró franquicias por categoría documentando que SUV y Furgón
eran *"un default razonable, no un dato confirmado"* — se los asimiló a Sedán
superior y a Pick-up sin que nadie lo decidiera. Y Pick-up quedó en $2.500.000
cuando la escalera de cobertura base definida el 14/08 lo ponía en $3.000.000.

Valores confirmados:

    Compacto            $1.500.000   (sin cambio)
    Sedán               $1.500.000   (sin cambio)
    Sedán superior      $2.000.000   (sin cambio)
    SUV                 $3.000.000   ← era $2.000.000
    Pick-up             $3.000.000   ← era $2.500.000
    Furgón              $3.000.000   ← era $2.500.000

Los tres coinciden en $3.000.000 y **no hay ninguna regla que los ate**: son
tres valores independientes que dan lo mismo. Si mañana uno cambia, los otros
no lo siguen.

**Por qué una migración y no la pantalla.** Es el mismo commit que expone
`franquicia_base` en la API y le da ABM a la pantalla de Categorías, así que de
acá en adelante esto se carga a mano. Esta migración existe para que los tres
valores queden bien **sin depender de que alguien se acuerde de entrar a
cargarlos**: mientras tanto, cada contrato que se emita para una Pick-up estaría
declarando una franquicia que nadie confirmó.

Sólo toca las tres que cambian, y sólo si siguen teniendo el valor viejo — si
alguien ya las corrigió a mano, esta migración no lo pisa.
"""
from alembic import op
import sqlalchemy as sa


revision = "073_franquicias_reales"
down_revision = "072_limpieza_configuracion"
branch_labels = None
depends_on = None


# (código, valor viejo que puso la 064, valor confirmado)
CAMBIOS = [
    ("suv", 2000000, 3000000),
    ("pickup", 2500000, 3000000),
    ("furgon", 2500000, 3000000),
]


def upgrade() -> None:
    conn = op.get_bind()
    for codigo, viejo, nuevo in CAMBIOS:
        conn.execute(
            sa.text(
                "UPDATE categorias SET franquicia_base = :nuevo "
                "WHERE codigo = :codigo AND franquicia_base = :viejo"
            ),
            {"codigo": codigo, "viejo": viejo, "nuevo": nuevo},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for codigo, viejo, nuevo in CAMBIOS:
        conn.execute(
            sa.text(
                "UPDATE categorias SET franquicia_base = :viejo "
                "WHERE codigo = :codigo AND franquicia_base = :nuevo"
            ),
            {"codigo": codigo, "viejo": viejo, "nuevo": nuevo},
        )
