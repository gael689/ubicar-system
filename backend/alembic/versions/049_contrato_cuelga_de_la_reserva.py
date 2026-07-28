"""El contrato cuelga de la reserva, no del alquiler

**El problema.** `contratos.alquiler_id` era obligatorio, y el alquiler recién
existe después del check-out. Eso hacía que el contrato sólo se pudiera emitir
cuando el auto ya estaba saliendo — justo el momento con menos tiempo para
leerlo, corregir un dato o mandárselo al cliente antes.

**El cambio.** El contrato pasa a colgar de la reserva, que existe desde que se
acuerda el alquiler. El `alquiler_id` queda opcional y se completa solo cuando
el check-out ocurre, para no perder el vínculo con la operación real.

Los datos de check-out (km y combustible de salida) siguen siendo del alquiler:
si el contrato se emite antes, salen en blanco y se completan al entregar. Es
lo correcto — inventar un kilometraje de salida sería peor que dejarlo vacío.

Revision ID: 049_contrato_reserva
Revises: 048_config_reservas_web
"""
from alembic import op
import sqlalchemy as sa

revision = "049_contrato_reserva"
down_revision = "048_config_reservas_web"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contratos", sa.Column("reserva_id", sa.Integer(), nullable=True))

    # Backfill: el alquiler siempre tuvo reserva, así que el dato ya existía —
    # sólo estaba a un salto de distancia.
    op.execute("""
        UPDATE contratos c
           SET reserva_id = a.reserva_id
          FROM alquileres a
         WHERE a.id = c.alquiler_id
           AND c.reserva_id IS NULL
    """)

    # Recién ahora se puede exigir. Si quedara alguno sin reserva, esto falla y
    # el deploy no avanza, que es lo que se quiere: un contrato huérfano no se
    # puede reimprimir ni asociar a nadie.
    op.alter_column("contratos", "reserva_id", nullable=False)
    op.create_foreign_key(
        "contratos_reserva_id_fkey", "contratos", "reservas", ["reserva_id"], ["id"]
    )
    op.create_index("ix_contratos_reserva_id", "contratos", ["reserva_id"])

    # El alquiler pasa a ser opcional: se completa al hacer el check-out.
    op.alter_column("contratos", "alquiler_id", nullable=True)


def downgrade() -> None:
    # Los contratos emitidos antes del check-out no tienen alquiler, así que no
    # entran en el esquema viejo. Se avisa en vez de borrarlos en silencio.
    huerfanos = op.get_bind().execute(
        sa.text("SELECT count(*) FROM contratos WHERE alquiler_id IS NULL")
    ).scalar()
    if huerfanos:
        raise RuntimeError(
            f"Hay {huerfanos} contrato(s) emitidos antes del check-out, sin alquiler. "
            "El esquema anterior no los admite. Resolvelos (haciendo el check-out "
            "o anulándolos) antes de bajar esta migración."
        )
    op.alter_column("contratos", "alquiler_id", nullable=False)
    op.drop_index("ix_contratos_reserva_id", table_name="contratos")
    op.drop_constraint("contratos_reserva_id_fkey", "contratos", type_="foreignkey")
    op.drop_column("contratos", "reserva_id")
