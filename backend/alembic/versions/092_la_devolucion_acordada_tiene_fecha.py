"""La devolución acordada puede caer otro día

**El caso real, con las palabras de Franco.** Alquiler del 04 al 06, retiro a las
16:30. El Ruso le vendió medio día más, así que el auto vuelve el **07 a las
08:30**. Hoy eso no se puede escribir, y las dos formas de intentarlo fallan:

- Cargar 04 → 07 cobra tres días enteros, y no hay dónde decir que en realidad lo
  devuelve a la mañana.
- Cargar 04 → 06 con "late check-in 08:30" hace que el sistema entienda **08:30
  del 06**, o sea *ocho horas antes* del horario pactado.

Y la segunda no falla ruidosamente, que sería lo bueno: `hora_devolucion_acordada`
es un `Time` suelto y los dos únicos lugares que lo usan
(`AlquilerService.preview_excedente` y `.checkin`) lo combinan con `fecha_fin`. La
resta contra el check-in real da **negativa**, `domain/control_24hs.py` la ve
dentro de los 40 minutos de gracia y devuelve cargo cero. **El medio día vendido
no se cobra y nada avisa.**

La fecha completa el dato: `fecha_devolucion_acordada` + `hora_devolucion_acordada`
son *cuándo vuelve el auto de verdad*, mientras `fecha_fin`/`hora_fin` siguen
siendo *el período que se factura*. Que puedan diferir es justamente el negocio:
el cargo por el medio día vive en `cargo_late_checkout`, aparte.

**El backfill iguala a `fecha_fin`** donde ya había una hora acordada: deja el
comportamiento de lo ya cargado idéntico al de hoy, y hace que `NULL` signifique
una sola cosa — "no se pactó otra devolución". Sin eso, `NULL` sería ambiguo entre
"no se pactó" y "se pactó el mismo día", y el `or fecha_fin` de los callers
tendría que adivinar para siempre.

Revision ID: 092_devolucion_con_fecha
Revises: 091_notas_vs_observaciones
"""
import sqlalchemy as sa
from alembic import op

revision = "092_devolucion_con_fecha"
down_revision = "091_notas_vs_observaciones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reservas",
        sa.Column("fecha_devolucion_acordada", sa.Date(), nullable=True),
    )
    op.get_bind().execute(sa.text("""
        UPDATE reservas
           SET fecha_devolucion_acordada = fecha_fin
         WHERE hora_devolucion_acordada IS NOT NULL
    """))


def downgrade() -> None:
    op.drop_column("reservas", "fecha_devolucion_acordada")
