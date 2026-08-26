"""Top Cover quedó marcada como incluida y el contrato dejó de ofrecerla

Error de la migración 085. Al renombrar la cobertura del +10 % a "Top Cover"
sólo se tocaron el código, el nombre y la descripción: **`incluido` quedó como
estaba**, y en producción la cobertura vieja lo tenía en `true`. Verificado
contra `/public/adicionales` el 26/08/2026: `cobertura_top` salía con
`incluido: true`.

**Qué rompe.** `incluido` cambia una sola cosa, y es en el contrato:
`ContratoService._bloque_coberturas` saca las coberturas incluidas de la lista
de rechazadas, porque "a pesar de la explicación no desea contratar Mid Cover"
en un contrato donde Mid Cover viene en el precio es una contradicción escrita.

Con Top Cover marcada como incluida, un cliente que la rechaza **firma un
contrato que no dice que se le ofreció**. Esa línea no es decoración: es la
prueba de que se ofreció y dijo que no, y es exactamente lo que se mira cuando
alguien choca y sostiene que nunca le ofrecieron nada.

Que el precio no se viera afectado es lo que lo hace peligroso: el número del
anverso está bien, el cobro está bien, y lo único que falta es una línea que
nadie extraña hasta que hace falta.

**Sólo Mid Cover viene incluida**, y se escribe de las dos formas —lo que tiene
que estar en `true` y lo que tiene que estar en `false`— en vez de tocar sólo la
fila mal. Así la tabla queda igual venga de donde venga la instalación, que es
justo lo que la 085 dio por sentado.

Revision ID: 087_solo_mid_incluida
Revises: 086_vehiculos_de_uber
"""
import sqlalchemy as sa
from alembic import op

revision = "087_solo_mid_incluida"
down_revision = "086_vehiculos_de_uber"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Ninguna cobertura viene incluida...
    bind.execute(sa.text(
        "UPDATE adicionales SET incluido = false WHERE grupo = 'cobertura'"
    ))
    # ...salvo Mid Cover, que es el escalón que trae el canon locativo.
    bind.execute(sa.text(
        "UPDATE adicionales SET incluido = true WHERE codigo = 'cobertura_mid'"
    ))


def downgrade() -> None:
    # No se revierte a mano: el estado anterior era el error. Volver a marcar
    # Top Cover como incluida sería reponer el bug.
    pass
