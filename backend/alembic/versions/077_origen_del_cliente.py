"""De dónde vino cada cliente, y quién lo cargó

Una reserva sabe desde la migración 047 si entró por la web o por el mostrador,
y quién la cargó. **El cliente no.** En su ficha, alguien que se registró solo
desde el sitio se ve exactamente igual que uno que cargó Franco a mano, y no hay
forma de saber cuál es cuál — ni de contestar "¿cuántos clientes nos trajo la
web este mes?", que es la única medida de si el canal sirve.

Lo único que había era una nota de texto libre: el alta web escribe *"Alta
automática desde una reserva web."* en `notas`. Eso no se puede filtrar, no se
puede contar, y se pierde apenas alguien edita las notas.

Se agregan dos columnas, con el mismo vocabulario que `reservas`:

- **`origen`** (`web` | `mostrador`), `mostrador` por default. Es el default
  correcto: el sistema nació siendo de mostrador y todo lo cargado a mano lo es.
- **`creado_por`** — el usuario que lo dio de alta. **Nulo cuando vino de la
  web**, y a propósito: el alta web la ejecuta el usuario "Sistema", y mostrar
  ese nombre en la ficha no le dice nada a nadie. Lo verdadero es que entró
  solo, y eso ya lo dice `origen`.

**El backfill infiere el origen de la nota que dejó el alta web.** Es la única
señal que existe en los datos viejos. Es imperfecta —si alguien editó esa nota
el cliente queda como de mostrador— y por eso no se inventa nada más: no se
adivina `creado_por` para los históricos, queda nulo. Un dato ausente es
honesto; uno inventado contamina la cuenta que esta migración viene a habilitar.

Revision ID: 077_origen_cliente
Revises: 076_indices_filtros
"""
import sqlalchemy as sa
from alembic import op

revision = "077_origen_cliente"
down_revision = "076_indices_filtros"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clientes",
        sa.Column(
            "origen",
            sa.String(length=20),
            nullable=False,
            server_default="mostrador",
        ),
    )
    op.add_column(
        "clientes", sa.Column("creado_por", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_clientes_creado_por", "clientes", "usuarios", ["creado_por"], ["id"]
    )
    # Se filtra por origen para contar altas por canal, y siempre acompañado de
    # la fecha de alta ("cuántos trajo la web este mes").
    op.create_index("ix_clientes_origen", "clientes", ["origen", "created_at"])

    # Backfill: la nota del alta automática es la única señal en los datos
    # viejos. Ver el encabezado sobre por qué no se infiere nada más.
    op.execute(
        """
        UPDATE clientes
           SET origen = 'web'
         WHERE notas LIKE 'Alta automática desde una reserva web%'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_clientes_origen", table_name="clientes")
    op.drop_constraint("fk_clientes_creado_por", "clientes", type_="foreignkey")
    op.drop_column("clientes", "creado_por")
    op.drop_column("clientes", "origen")
