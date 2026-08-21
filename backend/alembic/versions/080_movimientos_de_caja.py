"""La plata que se mueve sin ser de nadie

Hasta acá el sistema sabía **cuánto entró y cuánto salió** —`pagos` y `gastos`—
pero no **dónde quedó**. El efectivo que se deposita en el banco, el que alguien
retira, la garantía en efectivo que se guarda en el cajón y se devuelve, y la
plata que se le reintegra a un cliente: nada de eso tenía tabla.

Faltaba también un lugar concreto para el **reembolso**. `PLAN_DINERO.md` §3.1 y
§4.1 lo prometían como "egreso de caja" y no tenía dónde guardarse: `Gasto` no
sirve porque `vehiculo_id` es `NOT NULL` —un reintegro no es de ningún auto— y la
cuenta corriente sólo registra el asiento, no la salida de plata.

**Sin cliente y sin ledger, a propósito.** Un depósito al banco no le cambia el
saldo a nadie: la plata sigue siendo de la empresa, cambió de lugar. Y la
garantía tampoco toca la cuenta corriente (D-27), por eso entra acá.

**Los dos únicos datos que ningún evento dispara solo** son el depósito y el
retiro: alguien los tiene que cargar. El dueño decidió mantenerlos, y la caja
del día muestra el efectivo acumulado sin depositar con la fecha del último
depósito cargado — así el propio número empuja a cargarlos, y cuando está viejo
se ve que está viejo.

Revision ID: 080_movimientos_caja
Revises: 079_naturaleza
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "080_movimientos_caja"
down_revision = "079_naturaleza"
branch_labels = None
depends_on = None


TIPOS = (
    "deposito_banco",     # sale del cajón, entra al banco
    "retiro",             # sale del cajón, se lo lleva alguien
    "garantia_recibida",  # entra al cajón, no es de la empresa todavía
    "garantia_devuelta",  # vuelve al cliente
    "reembolso",          # se le devuelve plata a un cliente
)


def upgrade() -> None:
    # El tipo se crea una sola vez, acá, con `checkfirst` para que una corrida
    # repetida no explote. La columna de abajo lo declara con
    # `create_type=False`: sin eso `create_table` intenta crearlo **de nuevo** y
    # falla con "ya existe el tipo".
    sa.Enum(*TIPOS, name="tipo_movimiento_caja").create(op.get_bind(), checkfirst=True)
    tipo = postgresql.ENUM(*TIPOS, name="tipo_movimiento_caja", create_type=False)

    op.create_table(
        "movimientos_caja",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("fecha", sa.Date, nullable=False, index=True),
        sa.Column("tipo", tipo, nullable=False, index=True),
        # Siempre positivo: el signo lo define el tipo, no el monto. Un monto
        # negativo sería una segunda forma de decir lo mismo, y dos formas
        # significan que en algún momento van a discrepar.
        sa.Column("monto", sa.Numeric(12, 2), nullable=False),
        # El mismo vocabulario que `Pago.medio_pago`. Un depósito al banco sale
        # en efectivo; un reembolso puede ir por transferencia o por la propia
        # pasarela que cobró.
        sa.Column("medio", sa.String(30), nullable=False),
        # Obligatorio. Es plata moviéndose sin un evento del sistema detrás: sin
        # motivo, dentro de un mes nadie sabe qué fue.
        sa.Column("motivo", sa.Text, nullable=False),
        # Contexto opcional. Un reembolso cuelga de un cliente y a veces de una
        # reserva; un depósito no cuelga de nada.
        sa.Column("cliente_id", sa.Integer, sa.ForeignKey("clientes.id"), nullable=True, index=True),
        sa.Column("reserva_id", sa.Integer, sa.ForeignKey("reservas.id"), nullable=True),
        sa.Column("alquiler_id", sa.Integer, sa.ForeignKey("alquileres.id"), nullable=True),
        # El contra-asiento en la cuenta corriente, cuando el movimiento tuvo
        # uno (un reembolso sí; un depósito no).
        sa.Column(
            "movimiento_cc_id", sa.Integer,
            sa.ForeignKey("movimientos_cuenta_corriente.id"), nullable=True,
        ),
        sa.Column("creado_por", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        # Baja lógica. Nada de esta base se borra.
        sa.Column("anulado", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("motivo_anulacion", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("movimientos_caja")
    sa.Enum(name="tipo_movimiento_caja").drop(op.get_bind(), checkfirst=True)
