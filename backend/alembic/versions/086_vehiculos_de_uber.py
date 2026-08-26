"""Un auto de la flota puede no estar a la venta

Parte de los vehículos de Ubicar están afectados a Uber. **Siguen siendo de la
flota** —tienen VTV, póliza, services, gastos y hay que verlos en el panel—
pero no se alquilan, así que no pueden contar como cupo ni aparecer como
disponibles en la web.

Hasta ahora no había forma de decirlo. `DisponibilidadService._cargar_flota()`
trae todo lo que tenga `activo = true`, y de esa cuenta cuelgan la web, el paso
3 del wizard y el cupo interno. Un auto de Uber inflaba las tres, y la única
manera de sacarlo era `activo = false` — que lo borra del panel entero y se
lleva puestos sus vencimientos y sus gastos.

**Por qué una columna y no una `Categoria` nueva.** `Categoria` es la unidad de
venta: tiene tarifas, franquicia base, foto y specs, y es lo que el cliente
reserva. Un auto de Uber sigue siendo una Pick-up; lo que cambia no es qué es,
sino a qué está afectado. Mandarlo a una categoría "Uber" le sacaría su
categoría real y con ella su tarifa, su franquicia y su comparación con el
resto de la flota.

    destino = 'alquiler'   (default)  se alquila, cuenta para el cupo
    destino = 'uber'                  no se alquila, no cuenta, va al final

`String` y no un enum nativo, igual que `clientes.origen` (migración 077): si
mañana aparece un tercer destino —un auto de dirección, uno de reemplazo— es
una fila más y no un `ALTER TYPE`.

El default es `alquiler` y el backfill no adivina nada: los 16 vehículos
cargados pasan a `alquiler`, que es lo que venían siendo a los efectos del
sistema. Cuál es de Uber lo sabe Franco, no la base.

Revision ID: 086_vehiculos_de_uber
Revises: 085_coberturas_con_nombre
"""
import sqlalchemy as sa
from alembic import op

revision = "086_vehiculos_de_uber"
down_revision = "085_coberturas_con_nombre"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehiculos",
        sa.Column(
            "destino",
            sa.String(length=20),
            nullable=False,
            server_default="alquiler",
        ),
    )
    # La consulta que lo va a usar es la de disponibilidad, que ya filtra por
    # `activo`: el índice sirve a las dos juntas o no sirve a ninguna.
    op.create_index("ix_vehiculos_destino", "vehiculos", ["destino", "activo"])


def downgrade() -> None:
    op.drop_index("ix_vehiculos_destino", table_name="vehiculos")
    op.drop_column("vehiculos", "destino")
