"""Tarifa diaria generica por categoria, marcada como tal

Hasta ahora una categoria sin tarifa **no se puede cotizar**, y la web la
devuelve como *sin disponibilidad* aunque tenga autos libres: desde afuera
parece que no hay unidades, no que falta cargar un numero.

Se siembra una tarifa diaria generica para cada categoria activa que no tenga
ninguna, para que el sistema cotice de punta a punta desde el primer arranque.
El precio real lo ponen los duenios: cargar la tarifa de su categoria es una
decision comercial de ellos, no un dato que corresponda adivinar aca.

**El mismo monto para todas, a proposito.** Un valor distinto por categoria se
leeria como una lista de precios pensada, y nadie la revisaria. Todas iguales
se ve de un vistazo que nadie las toco todavia.

`es_generica` es lo que evita el peor final posible de esto: que el placeholder
se venda. Mientras la marca este puesta:

- la fila sale con el cartel "generica" en Flota -> Categorias;
- la campana **sigue reclamando** esa categoria. Sin la marca, sembrar la
  tarifa apagaria el aviso `categoria_sin_precio` y el recordatorio de poner el
  precio real desapareceria justo cuando empieza a hacer falta.

La marca se limpia sola: cargar una tarifa diaria nueva desactiva la anterior
(`TarifaService.create_for_categoria`), asi que apenas alguien pone el precio
de verdad, la generica pasa al historico y el aviso se apaga.

Revision ID: 058_tarifa_generica
Revises: 057_medio_pago_wapa
"""
from alembic import op
import sqlalchemy as sa


revision = "058_tarifa_generica"
down_revision = "057_medio_pago_wapa"
branch_labels = None
depends_on = None


# Redondo y sin decimales: tiene que leerse como un numero puesto de relleno,
# no como un precio calculado.
MONTO_GENERICO = 80000


def upgrade() -> None:
    op.add_column(
        "tarifas",
        sa.Column("es_generica", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    conn = op.get_bind()

    # Si ya hay una tarifa general (sin categoria ni vehiculo), todo cotiza y
    # sembrar por categoria solo agregaria filas que pisan esa general.
    hay_general = conn.execute(sa.text("""
        SELECT COUNT(*) FROM tarifas
        WHERE activo AND categoria_id IS NULL AND vehiculo_id IS NULL
    """)).scalar_one()
    if hay_general:
        return

    conn.execute(sa.text("""
        INSERT INTO tarifas (categoria_id, vehiculo_id, tipo, monto, activo,
                             vigencia_desde, es_generica)
        SELECT c.id, NULL, 'diaria', :monto, TRUE, CURRENT_DATE, TRUE
        FROM categorias c
        WHERE c.activo
          AND NOT EXISTS (
              SELECT 1 FROM tarifas t
              WHERE t.categoria_id = c.id AND t.tipo = 'diaria' AND t.activo
          )
    """).bindparams(monto=MONTO_GENERICO))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM tarifas WHERE es_generica"))
    op.drop_column("tarifas", "es_generica")
