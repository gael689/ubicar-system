"""Canal en las tarifas por banda (camino A).

Fase 6 de la reestructuración.

**El punto de partida.** Las reglas de calendario (`tarifas_calendario`) tienen
canal desde que existen: una promo puede ser sólo de web, sólo de mostrador, o
de los dos. Las tarifas por banda —el precio de lista, el que cotiza cuando
ninguna regla cubre el día— **no lo tenían**, así que el precio base era
obligatoriamente el mismo para los dos canales.

Mientras los precios coincidían, eso alcanzaba. Al confirmarse que van a
diferir seguido, deja de alcanzar por dos motivos:

1. **Vencimiento silencioso.** Sostener el precio de la web con una regla de
   calendario significa que esa regla tiene fecha de fin. El día que vence y
   nadie la renueva, la web **no da error**: cae al precio del mostrador y
   sigue vendiendo. Y la web es el canal donde no hay nadie mirando.
2. **La auditoría se degrada.** Si el precio base fuera el de la web y el
   mostrador cobrara distinto casi siempre, casi toda reserva pediría motivo
   (regla 1.7) — y una auditoría que se dispara siempre deja de señalar nada.

**La semántica es la misma que ya tienen las reglas**, a propósito: `ambos` es
el default y rige en los dos canales; una tarifa de canal específico le gana a
la de `ambos` **sólo en ese canal**; y si no hay tarifa del canal pedido se usa
la de `ambos`. **Nunca se queda sin precio**, que es la falla que haría esto
peligroso.

**Compatibilidad total.** Todo lo cargado hoy queda en `ambos`, así que cotiza
exactamente igual que antes. Sin datos que migrar.
"""
from alembic import op
import sqlalchemy as sa


revision = "074_canal_en_tarifas"
down_revision = "073_franquicias_reales"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Se reusa el tipo enum que ya creó la migración de `tarifas_calendario`:
    # son el mismo concepto y tener dos enums con los mismos valores es pedir
    # que se desincronicen. `create_type=False` evita que Alembic intente
    # crearlo de nuevo y falle.
    canal_enum = sa.Enum(
        "ambos", "web", "mostrador",
        name="canal_tarifa_calendario",
        create_type=False,
    )
    op.add_column(
        "tarifas",
        sa.Column(
            "canal",
            canal_enum,
            nullable=False,
            server_default="ambos",
        ),
    )
    # El índice acompaña al filtro real: siempre se busca por tipo + canal
    # dentro de un vehículo o una categoría.
    op.create_index("ix_tarifas_canal", "tarifas", ["canal"])


def downgrade() -> None:
    op.drop_index("ix_tarifas_canal", table_name="tarifas")
    op.drop_column("tarifas", "canal")
