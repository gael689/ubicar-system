"""El débito con ancla en check-in deja de nacer sin fecha

Cuando la condición de pago cuenta los días **desde que el auto vuelve**
(D-41, `condicion_pago_ancla = 'checkin'`), el débito del check-out nacía con
`fecha_vencimiento = None`: al entregar el auto todavía no se sabe cuándo lo
devuelven, así que no había contra qué calcular.

El problema es lo que eso produce. Un débito sin vencimiento **no aparece en
ningún aviso**: `cc_vencida` y `cc_vencimiento_proximo` filtran por
`fecha_vencimiento`, y un `NULL` nunca entra. Una deuda de $400.000 quedaba
invisible hasta que alguien hiciera el check-in y la completara — y si el auto
se devolvía tarde, o el check-in se cargaba con demora, era invisible más
tiempo todavía.

Ahora nace con **la fecha de fin pactada de la reserva** como ancla, y el
check-in real lo recalcula. La columna nueva dice que esa fecha es provisoria:

- Sin ella, la pantalla mostraría "Vence 12/09" con la misma cara con la que
  muestra un vencimiento firme, y nadie sabría que puede correrse.
- Y `editar_vencimiento` no sirve para distinguirlas: ésa marca el vencimiento
  que alguien **corrió a mano**, que es lo contrario — una decisión, no una
  estimación.

⚠️ **El orden importa y ya se cumplió.** Hacer visible este débito antes del
filtro por alquiler de la Fase 1 habría multiplicado las falsas alertas de deuda
vencida, porque todo débito al contado ya generaba una. Ver `PLAN_DINERO.md`
§3.4 y §9.1.

Revision ID: 082_vencimiento_provisorio
Revises: 081_garantia_completa
"""
import sqlalchemy as sa
from alembic import op

revision = "082_vencimiento_provisorio"
down_revision = "081_garantia_completa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "movimientos_cuenta_corriente",
        sa.Column(
            "vencimiento_provisorio", sa.Boolean,
            nullable=False, server_default="false",
        ),
    )
    # Los débitos que hoy están sin fecha son exactamente los de ancla
    # check-in: nadie más nace sin vencimiento. Se les calcula desde la fecha de
    # fin pactada de su reserva y se los marca provisorios.
    op.execute(
        "UPDATE movimientos_cuenta_corriente m "
        "SET fecha_vencimiento = r.fecha_fin, vencimiento_provisorio = true "
        "FROM reservas r "
        "WHERE m.reserva_id = r.id "
        "  AND m.tipo = 'debito' "
        "  AND m.anulado = false "
        "  AND m.fecha_vencimiento IS NULL"
    )


def downgrade() -> None:
    # La vuelta atrás devuelve a NULL sólo lo que esta migración completó, para
    # no borrar una fecha que alguien puso a mano.
    op.execute(
        "UPDATE movimientos_cuenta_corriente "
        "SET fecha_vencimiento = NULL WHERE vencimiento_provisorio = true"
    )
    op.drop_column("movimientos_cuenta_corriente", "vencimiento_provisorio")
