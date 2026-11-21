"""Avisos: columna `datos` y claves de las oportunidades

Pedido de Gael (21/11/2026): *"que el sistema sugiera oportunidades […] que
diga cuando está un auto parado hace mucho tiempo"*.

Las oportunidades viajan por la misma tabla que los avisos y necesitan llevar
algo más que texto: el impacto estimado en pesos, el texto del botón, el link
de WhatsApp prearmado. Va en una columna JSON nullable — cada regla trae lo
suyo y los avisos de siempre la dejan en NULL.

Además se siembran las dos claves de `configuracion` que alguien puede querer
tocar sin pedir un cambio de código: el link de reseñas de Google (vacío: sin
link, el mensaje pide la reseña igual pero no lo incluye) y cuántos días sin
salir hacen que un auto figure como parado. El resto de los umbrales vive en
`domain/oportunidades_reglas.py` y se puede pisar agregando la clave a mano.

Aditiva: no toca ningún ENUM ni ninguna fila existente.

Revision ID: 108_notificacion_datos
Revises: 107_prospectos_sin_contacto
"""
import sqlalchemy as sa
from alembic import op

revision = "108_notificacion_datos"
down_revision = "107_prospectos_sin_contacto"
branch_labels = None
depends_on = None


CLAVES = [
    (
        "oportunidades.url_resenas_google",
        "",
        "string",
        "Oportunidades",
        "Link para dejar una reseña en Google. Se agrega al mensaje de WhatsApp "
        "que se les manda a los clientes que devolvieron el auto sin problemas. "
        "Vacío: el mensaje pide la reseña sin link.",
    ),
    (
        "oportunidades.auto_parado_dias",
        "10",
        "int",
        "Oportunidades",
        "Días sin salir a partir de los cuales un auto disponible y sin reservas "
        "a la vista aparece como oportunidad (\"auto parado\").",
    ),
]


def upgrade() -> None:
    op.add_column("notificaciones", sa.Column("datos", sa.JSON(), nullable=True))

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
    conn = op.get_bind()
    for clave, *_ in CLAVES:
        conn.execute(sa.text("DELETE FROM configuracion WHERE clave = :c"), {"c": clave})
    op.drop_column("notificaciones", "datos")
