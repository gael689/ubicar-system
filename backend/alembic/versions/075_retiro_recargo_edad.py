"""Retiro del recargo por franja etaria (D-38).

Fase 7 de la reestructuración.

**Qué se retira y por qué.** D-38 puso un recargo por edad en vez de una edad
mínima: *"no se rechaza a nadie, la edad modifica el precio"*. Después D-51 puso
una edad mínima de 21 para la web. Las dos reglas quedaron conviviendo, y el
efecto neto era raro: **por debajo de 21 la web no vendía, y de 21 a 24 se
cobraba 15% extra** (la única franja cargada era "Conductor joven", 18-24, 15%
por día). Se decidió quedarse con la edad mínima sola.

**Esto es una baja de precio real**, no sólo limpieza de código: los conductores
de 21 a 24 pasan a pagar lo mismo que el resto.

**Sin datos que migrar.** Verificado antes de escribir esto: ninguna reserva
tiene datos congelados en las cuatro columnas (`recargo_edad_id`,
`recargo_edad_nombre`, `recargo_edad_monto`, `recargo_edad_edad`), y ningún
código las leía — sólo se escribían. Nunca llegaron a serializarse a la API.

**Dos cosas que la 044 creó y NO se tocan:**

- `conductores_adicionales.fecha_nacimiento`: nació con el recargo pero le
  sobrevivió, porque la edad mínima necesita saber la edad de quien maneja.
- El enum `unidad_cobro_adicional`: lo comparte la tabla `adicionales`.
"""
from alembic import op
import sqlalchemy as sa


revision = "075_retiro_recargo_edad"
down_revision = "074_canal_en_tarifas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Primero las columnas de `reservas`: tienen una FK contra `recargos_edad`,
    # así que la tabla no se puede borrar antes.
    op.drop_column("reservas", "recargo_edad_id")
    op.drop_column("reservas", "recargo_edad_nombre")
    op.drop_column("reservas", "recargo_edad_monto")
    op.drop_column("reservas", "recargo_edad_edad")

    op.drop_index("ix_recargos_edad_franja", table_name="recargos_edad")
    op.drop_table("recargos_edad")


def downgrade() -> None:
    """
    Repone la estructura, **no los datos**.

    Las franjas que hubiera cargadas se pierden. Es aceptable porque había una
    sola y es la que se decidió sacar; anotarla acá para reponerla sería fijar
    en una migración un valor comercial que ya no rige.
    """
    op.create_table(
        "recargos_edad",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("edad_desde", sa.Integer(), nullable=False),
        sa.Column("edad_hasta", sa.Integer(), nullable=True),
        sa.Column("monto", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("porcentaje", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column(
            "unidad_cobro",
            sa.Enum("por_dia", "unico", name="unidad_cobro_adicional", create_type=False),
            nullable=False,
            server_default="por_dia",
        ),
        sa.Column("categoria_id", sa.Integer(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["categoria_id"], ["categorias.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_recargos_edad_franja", "recargos_edad", ["edad_desde", "edad_hasta"]
    )

    op.add_column("reservas", sa.Column("recargo_edad_id", sa.Integer(), nullable=True))
    op.add_column("reservas", sa.Column("recargo_edad_nombre", sa.String(length=120), nullable=True))
    op.add_column(
        "reservas",
        sa.Column(
            "recargo_edad_monto",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column("reservas", sa.Column("recargo_edad_edad", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "reservas_recargo_edad_id_fkey", "reservas", "recargos_edad",
        ["recargo_edad_id"], ["id"],
    )
