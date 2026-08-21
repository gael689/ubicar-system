"""La cobertura dice cuánto BAJA la franquicia, no cuánto queda

`Adicional.franquicia` guardaba **un número absoluto**: "con esta cobertura tu
franquicia es $500.000". Eso sólo puede ser cierto para una categoría, y hay
seis con tres bases distintas:

    Compacto y Sedán      $1.500.000
    Sedán superior        $2.000.000
    SUV, Pick-up, Furgón  $3.000.000

Con un absoluto compartido, la misma "Cobertura reducida (+10%)" le bajaba
$1.000.000 a un Compacto y $2.500.000 a una SUV. El mismo porcentaje de precio
comprando beneficios distintos, y nadie lo veía porque el número que se mostraba
era el resultado, no el descuento.

Y el caso que lo hizo evidente: **"Cobertura total" tenía franquicia `0`**. No
existe la franquicia cero — son **dos descuentos de $500.000**, uno por el 10% y
otro por el 30%. Sobre un Compacto quedan $500.000; sobre una SUV, $2.000.000.

Por eso la columna nueva guarda **el descuento**, que es lo que realmente define
la cobertura, y la franquicia que ve el cliente se calcula contra la base de
**su** categoría (`domain/franquicia.py`).

`franquicia` se elimina en vez de dejarse al lado: dos fuentes para el mismo
número terminan discrepando, y ésta ya estaba mal en producción.

Revision ID: 084_franquicia_descuento
Revises: 083_nada_se_borra
"""
import sqlalchemy as sa
from alembic import op

revision = "084_franquicia_descuento"
down_revision = "083_nada_se_borra"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "adicionales",
        sa.Column("franquicia_descuento", sa.Numeric(12, 2), nullable=True),
    )

    # Backfill. **No se deriva del valor viejo a propósito**: ese número estaba
    # mal (0 para la cobertura total) y derivar de un dato malo propaga el
    # error con cara de migración prolija.
    #
    # Son **dos escalones**, no dos veces el mismo descuento: el cliente elige
    # uno de los dos, así que "total" tiene que descontar lo de "reducida" más
    # su propio tramo. Sobre una base de $1.500.000:
    #
    #     reducida (+10%)   −  $500.000  →  queda $1.000.000
    #     total    (+30%)   −$1.000.000  →  queda $  500.000
    #
    # Se identifican por el porcentaje sobre el alquiler, que es el dato que sí
    # estaba bien cargado, y no por el nombre — un nombre se edita.
    op.execute(
        "UPDATE adicionales SET franquicia_descuento = 500000 "
        "WHERE grupo = 'cobertura' AND porcentaje_sobre_alquiler = 10"
    )
    op.execute(
        "UPDATE adicionales SET franquicia_descuento = 1000000 "
        "WHERE grupo = 'cobertura' AND porcentaje_sobre_alquiler = 30"
    )
    # Cualquier otra cobertura que existiera queda sin descuento cargado, que
    # es lo honesto: la campana `categoria_sin_franquicia` ya reclama los
    # huecos, y un número inventado acá no lo reclamaría nadie.

    op.drop_column("adicionales", "franquicia")


def downgrade() -> None:
    op.add_column("adicionales", sa.Column("franquicia", sa.Numeric(12, 2), nullable=True))
    # La vuelta atrás no puede reconstruir el absoluto: dependía de la
    # categoría, que es justamente lo que esta migración vino a arreglar.
    op.drop_column("adicionales", "franquicia_descuento")
