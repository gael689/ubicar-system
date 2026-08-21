"""La tarjeta de garantía deja de guardar el número completo

`reservas.garantia_tarjeta_numero` guardaba **el número entero de la tarjeta,
en texto plano**. Es un dato de tarjeta de crédito almacenado sin ninguna
protección, en una base cuyo backup se copia a mano.

La discusión que había en `ALTERNATIVAS_COBRO.md` era sobre **preautorización**
—qué pasarela reserva fondos de verdad, porque anotar la tarjeta no garantiza
nada— y arrastraba esto como "tarea aparte". No lo es: son dos problemas
distintos y este tiene una solución de una línea.

**El sistema no está lanzado**, así que no hay ninguna tarjeta real cargada y
no hay nada que proteger a posteriori. La solución no es encriptar, es **dejar
de guardarlo**: se conservan los **últimos cuatro dígitos** —lo único que el
mostrador necesita para reconocer la tarjeta frente al cliente— y el
vencimiento y el titular, que ya estaban.

Si algún día hace falta el número entero, va a ser porque se cobra con él, y
entonces lo va a guardar la pasarela y devolver un token. Nunca esta base.

Ver `PLAN_DINERO.md`, corrección A de la Fase 1.

Revision ID: 078_tarjeta_sin_numero
Revises: 077_origen_cliente
"""
import sqlalchemy as sa
from alembic import op

revision = "078_tarjeta_sin_numero"
down_revision = "077_origen_cliente"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Los últimos cuatro se copian de lo que hubiera cargado, y recién después
    # se borra la columna vieja. En una base ya limpia no copia nada; en una de
    # desarrollo con datos de prueba, conserva lo que sirve.
    op.add_column(
        "reservas",
        sa.Column("garantia_tarjeta_ultimos4", sa.String(4), nullable=True),
    )
    op.execute(
        """
        UPDATE reservas
           SET garantia_tarjeta_ultimos4 = RIGHT(
                   regexp_replace(garantia_tarjeta_numero, '\D', '', 'g'), 4
               )
         WHERE garantia_tarjeta_numero IS NOT NULL
           AND garantia_tarjeta_numero <> ''
        """
    )
    op.drop_column("reservas", "garantia_tarjeta_numero")


def downgrade() -> None:
    # La vuelta atrás recrea la columna **vacía**. El número completo no se
    # puede reconstruir desde cuatro dígitos, y eso es exactamente el punto.
    op.add_column(
        "reservas",
        sa.Column("garantia_tarjeta_numero", sa.String(20), nullable=True),
    )
    op.drop_column("reservas", "garantia_tarjeta_ultimos4")
