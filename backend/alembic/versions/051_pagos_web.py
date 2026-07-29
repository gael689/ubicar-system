"""Cobro online: rastro de Mercado Pago, medio de pago propio y descuento por pago total

**Por que una tabla aparte de `pagos`.** `Pago` es el hecho economico: existe
solo cuando la plata entro, genera el credito en la cuenta corriente y suma a
la caja del dia (migracion 043). El cobro online necesita registrar algo
antes: la preferencia se crea cuando el cliente abre el checkout, y la mayoria
de esas conversaciones no terminan en un pago. Los intentos rechazados son
justamente los que hay que poder mirar cuando alguien llama diciendo "pague y
no me llego nada".

**`payment_id` unico es la idempotencia.** Mercado Pago reintenta el webhook
—es su comportamiento normal, no una falla— y sin esta restriccion un solo
pago genera dos asientos en la cuenta corriente. La unicidad esta en la base y
no solo en el codigo porque dos webhooks concurrentes pasan la verificacion en
memoria al mismo tiempo.

**`mercado_pago` como medio de pago propio.** Se podria haber reusado
"tarjeta", pero entonces la caja del dia mezclaria lo que se cobro en el
mostrador con lo que entro por la web, y son dos cosas que se concilian contra
extractos distintos.

**El descuento por pagar el 100% va a `configuracion` (D-30)**, no al codigo:
es una palanca comercial que los duenos van a querer mover segun la temporada,
y cambiarla no puede requerir un deploy. Se siembra en 0 — sin descuento
hasta que decidan el numero.

Revision ID: 051_pagos_web
Revises: 050_firma_medio
"""
from alembic import op
import sqlalchemy as sa


revision = "051_pagos_web"
down_revision = "050_firma_medio"
branch_labels = None
depends_on = None


CLAVE_DESCUENTO = "web.descuento_pago_total_pct"


def upgrade() -> None:
    # ── Medio de pago propio para lo que entra por la web ─────────────────
    op.execute("ALTER TYPE medio_pago ADD VALUE IF NOT EXISTS 'mercado_pago'")

    # ── El rastro de cada intento de cobro ────────────────────────────────
    op.create_table(
        "pagos_web",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        # La reserva ya existe cuando se crea la preferencia: entra en
        # `pendiente_pago` y el cupo lo sostiene el hold, no la reserva.
        sa.Column("reserva_id", sa.Integer(), sa.ForeignKey("reservas.id"),
                  nullable=False, index=True),
        sa.Column("hold_token", sa.String(64), nullable=True),

        sa.Column("preference_id", sa.String(120), nullable=False, index=True),
        # URL de Checkout Pro. Permite devolver la misma preferencia ante un
        # doble clic —en vez de crear una segunda reserva— y reenviarle el link
        # a quien abandono el pago.
        sa.Column("init_point", sa.String(500), nullable=True),
        # Nullable hasta que el cliente efectivamente paga. La unicidad
        # aplica igual: Postgres permite multiples NULL en un unique.
        sa.Column("payment_id", sa.String(120), nullable=True, unique=True, index=True),

        sa.Column("monto", sa.Numeric(12, 2), nullable=False),
        sa.Column("porcentaje_anticipo", sa.Integer(), nullable=False),
        # El total del alquiler congelado al momento de cobrar: sin esto, un
        # cambio de precios posterior vuelve irreconstruible por que se cobro
        # ese importe.
        sa.Column("total_reserva", sa.Numeric(12, 2), nullable=False),
        sa.Column("descuento_pago_total", sa.Numeric(12, 2),
                  nullable=False, server_default="0"),

        sa.Column("estado", sa.Enum("iniciado", "aprobado", "pendiente", "rechazado",
                                    "devuelto", "revision", name="estado_pago_web"),
                  nullable=False, server_default="iniciado", index=True),
        # `status` crudo de Mercado Pago, sin traducir: es lo que se compara
        # para decidir si un webhook repetido ya fue procesado.
        sa.Column("estado_externo", sa.String(40), nullable=True),

        sa.Column("pago_id", sa.Integer(), sa.ForeignKey("pagos.id"),
                  nullable=True, index=True),

        # Respuesta completa de la API: permite auditar un cobro discutido sin
        # depender de que el panel de Mercado Pago siga mostrando la operacion.
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("detalle", sa.Text(), nullable=True),

        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("procesado_en", sa.DateTime(), nullable=True),
    )
    # La consulta del webhook es siempre por payment_id (ya indexado por el
    # unique). Esta otra es la de la bandeja: los que quedaron a medias.
    op.create_index("ix_pagos_web_pendientes", "pagos_web", ["estado", "created_at"])

    # ── Descuento por pago total (D-30) ───────────────────────────────────
    conf = sa.table(
        "configuracion",
        sa.column("clave", sa.String),
        sa.column("valor", sa.String),
        sa.column("tipo", sa.String),
        sa.column("categoria", sa.String),
        sa.column("descripcion", sa.String),
    )
    conn = op.get_bind()
    existe = conn.execute(
        sa.text("SELECT 1 FROM configuracion WHERE clave = :c"), {"c": CLAVE_DESCUENTO}
    ).first()
    if not existe:
        op.bulk_insert(conf, [{
            "clave": CLAVE_DESCUENTO,
            "valor": "0",
            "tipo": "int",
            "categoria": "Reservas web",
            "descripcion": (
                "Descuento (en %) para quien paga el 100% del alquiler por "
                "adelantado desde la web. Cobrar todo por adelantado elimina la "
                "cobranza en el mostrador y el incobrable: este es el porcentaje "
                "de margen que se resigna a cambio. En 0 no se aplica ninguno."
            ),
        }])


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM configuracion WHERE clave = :c"), {"c": CLAVE_DESCUENTO}
    )
    op.drop_index("ix_pagos_web_pendientes", table_name="pagos_web")
    op.drop_table("pagos_web")
    op.execute("DROP TYPE IF EXISTS estado_pago_web")
    # Postgres no permite quitar valores de un ENUM: 'mercado_pago' queda
    # definido en medio_pago aunque nadie lo use. Es inofensivo.
