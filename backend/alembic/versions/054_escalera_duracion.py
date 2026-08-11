"""Escalera de descuentos por duracion (D-43)

El precio de cada categoria pasa a definirse en UN solo numero: cuanto sale un
dia al 100%. El largo del alquiler no se carga como precios distintos, se
descuenta con porcentajes:

    1 a 2 dias    ->  100% (sin descuento: es el precio de lista)
    3 a 6 dias    ->  -10%
    7 a 15 dias   ->  -15%
    16 dias o mas ->  -30%

El motor que lo aplica ya existia (`descuentos_duracion` +
`domain/precios.seleccionar_descuento`) y estaba VACIO: por eso un alquiler de
20 dias se cobraba al mismo precio por dia que uno de 2.

Dos cosas que esta migracion NO hace, a proposito:

1. **No toca las tarifas.** El precio por dia de cada categoria se carga en
   Flota -> Categorias, a mano, porque es un dato del negocio.
2. **No pisa nada si ya hay bandas cargadas.** Si alguien ya definio su propia
   escalera, esta migracion no corre: sembrar por encima le cambiaria los
   precios sin avisar.

Y una advertencia que queda escrita en el sistema, no solo aca: la escalera
sirve **si la categoria tiene UNICAMENTE tarifa diaria**. Una tarifa semanal o
mensual cargada ademas de la diaria ya abarata los alquileres largos por su
cuenta (D-35, precio por bloque), y sumarle el porcentaje descuenta dos veces.

Revision ID: 054_escalera_duracion
Revises: 053_auditoria
"""
from alembic import op
import sqlalchemy as sa


revision = "054_escalera_duracion"
down_revision = "053_auditoria"
branch_labels = None
depends_on = None


# (nombre, dias_desde, dias_hasta, porcentaje)
#
# `dias_hasta = None` es "sin tope". La ultima banda queda abierta y no cerrada
# en 30 a proposito: con un tope, el dia 31 volveria a valer el 100% y un
# alquiler de un mes y un dia saldria mas caro que uno de un mes. Ese escalon
# invertido es la clase de error que se descubre facturando.
BANDAS = [
    ("3 a 6 dias", 3, 6, "10.00"),
    # Cubre hasta el 15 y no hasta el 14: entre "7 a 14" y "16 a 30" quedaba el
    # dia 15 sin ninguna banda, o sea cobrado al 100% entre dos tramos con
    # descuento. Se estira la banda del medio, que es la opcion conservadora
    # (el dia 15 recibe el descuento menor de los dos que lo rodean).
    ("7 a 15 dias", 7, 15, "15.00"),
    ("16 dias o mas", 16, None, "30.00"),
]


def upgrade() -> None:
    conn = op.get_bind()

    # Idempotente y no destructiva: si ya hay una escalera cargada, se respeta.
    ya_hay = conn.execute(
        sa.text("SELECT COUNT(*) FROM descuentos_duracion")
    ).scalar_one()
    if ya_hay:
        return

    for nombre, desde, hasta, porcentaje in BANDAS:
        conn.execute(
            sa.text("""
                INSERT INTO descuentos_duracion
                    (nombre, categoria_id, dias_desde, dias_hasta, porcentaje,
                     activo, created_at)
                VALUES (:nombre, NULL, :desde, :hasta, :porcentaje, TRUE, NOW())
            """).bindparams(
                nombre=nombre, desde=desde, hasta=hasta, porcentaje=porcentaje,
            )
        )


def downgrade() -> None:
    conn = op.get_bind()
    for nombre, desde, hasta, porcentaje in BANDAS:
        conn.execute(
            sa.text("""
                DELETE FROM descuentos_duracion
                WHERE nombre = :nombre AND dias_desde = :desde
                  AND categoria_id IS NULL AND creado_por IS NULL
            """).bindparams(nombre=nombre, desde=desde)
        )
