"""La naturaleza del asiento, la aplicación del anticipo, y el pago que sabe de qué reserva es

Tres columnas nuevas en `movimientos_cuenta_corriente` y una en `pagos`. Son la
base de la Fase 2 del `PLAN_DINERO.md`: un solo camino para la plata que entra
antes del check-out.

**`naturaleza`.** Hoy `tipo` tiene dos valores (`debito`/`credito`) y la
naturaleza del asiento vive en el **texto libre** de `concepto`: para saber si
un crédito es una seña, un pago, un echeq en cartera o una bonificación hay que
leer una cadena escrita a mano. Eso no se puede consultar, no se puede sumar y
no se puede mostrar como etiqueta.

Se agrega una columna **al lado** de `tipo` en vez de ampliar el enum: `tipo` es
el **signo** y de él depende todo el cálculo del saldo
(`domain/cuenta_corriente.py::signo_movimiento`). Separarlos deja esa lógica
intacta.

El backfill deduce la naturaleza de lo que ya está escrito. Es imperfecto por
definición —el `concepto` es texto libre— y por eso lo que no matchea queda en
`manual`, que es lo honesto: "un asiento que alguien puso, no sé por qué".

**`aplicado_por_movimiento_id` + `aplicado_en`.** La aplicación de un anticipo
contra el débito del alquiler **no es un movimiento nuevo**: sumaría un asiento
por cada alquiler sin agregar información. Es una marca en el propio anticipo.
Con eso, *anticipos por aplicar* = créditos `anticipo` con la marca en NULL, no
anulados. Una consulta, sin inflar el libro.

**`pagos.reserva_id`.** Es lo que permite que un `Pago` sepa de qué reserva es
antes de que exista el alquiler. Sin esto, el único puente entre un cobro
anterior a la entrega y su alquiler era `PagoWeb.pago_id`, que existe sólo para
Mercado Pago — por eso el arreglo de la Fase 1 quedó limitado a ese camino
(`PLAN_DINERO.md` §1.5.a).

Revision ID: 079_naturaleza
Revises: 078_tarjeta_sin_numero
"""
import sqlalchemy as sa
from alembic import op

revision = "079_naturaleza"
down_revision = "078_tarjeta_sin_numero"
branch_labels = None
depends_on = None


NATURALEZAS = (
    "alquiler",           # débito del check-out
    "extension",          # débito por extender el alquiler
    "excedente",          # débito por devolver tarde
    "cargo_cierre",       # combustible y limpieza
    "multa",
    "danio",
    "anticipo",           # crédito: plata que entró antes del check-out
    "pago",               # crédito: plata que entró contra una deuda existente
    "echeq_en_cartera",   # crédito: un papel, no plata todavía
    "sena_retenida",      # débito: la seña que no se devuelve (D-11)
    "reembolso",          # débito: plata que sale
    "bonificacion",       # crédito: deuda perdonada
    "anulacion",          # contra-asiento
    "manual",             # lo cargó una persona a mano
)


def upgrade() -> None:
    naturaleza = sa.Enum(*NATURALEZAS, name="naturaleza_movimiento")
    naturaleza.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "movimientos_cuenta_corriente",
        sa.Column("naturaleza", naturaleza, nullable=True),
    )
    op.create_index(
        "ix_movimientos_cc_naturaleza",
        "movimientos_cuenta_corriente",
        ["naturaleza"],
    )

    # ── Backfill ────────────────────────────────────────────────────────────
    # De lo más específico a lo más general: cada UPDATE sólo toca lo que
    # todavía está en NULL, así que el orden define la precedencia.
    #
    # Las FK mandan sobre el texto: si el movimiento tiene `multa_id`, es una
    # multa, diga lo que diga el concepto.
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'anulacion' "
        "WHERE naturaleza IS NULL AND concepto LIKE 'Anulación de movimiento #%'"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente "
        "SET naturaleza = CASE WHEN tipo = 'debito' THEN 'multa' ELSE 'pago' END "
        "WHERE naturaleza IS NULL AND multa_id IS NOT NULL"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente "
        "SET naturaleza = CASE WHEN tipo = 'debito' THEN 'danio' ELSE 'pago' END "
        "WHERE naturaleza IS NULL AND danio_id IS NOT NULL"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'echeq_en_cartera' "
        "WHERE naturaleza IS NULL AND echeq_id IS NOT NULL AND tipo = 'credito'"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'sena_retenida' "
        "WHERE naturaleza IS NULL AND concepto LIKE 'Cancelación de reserva #%'"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'excedente' "
        "WHERE naturaleza IS NULL AND concepto LIKE 'Excedente alquiler #%'"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'cargo_cierre' "
        "WHERE naturaleza IS NULL AND concepto LIKE 'Cargos de cierre%'"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'alquiler' "
        "WHERE naturaleza IS NULL AND tipo = 'debito' AND concepto LIKE 'Alquiler #%'"
    )
    # Un crédito atado a una reserva que todavía no salió es un anticipo. Es el
    # mismo proxy que usaba `desglose` antes de esta migración — se usa una
    # última vez, para el backfill, y después se retira.
    op.execute(
        "UPDATE movimientos_cuenta_corriente m SET naturaleza = 'anticipo' "
        "WHERE m.naturaleza IS NULL AND m.tipo = 'credito' "
        "AND m.reserva_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM alquileres a WHERE a.reserva_id = m.reserva_id)"
    )
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'pago' "
        "WHERE naturaleza IS NULL AND tipo = 'credito' AND pago_id IS NOT NULL"
    )
    # Lo que no se pudo deducir queda en `manual`, que es lo honesto.
    op.execute(
        "UPDATE movimientos_cuenta_corriente SET naturaleza = 'manual' "
        "WHERE naturaleza IS NULL"
    )
    op.alter_column("movimientos_cuenta_corriente", "naturaleza", nullable=False)

    # ── Aplicación del anticipo ─────────────────────────────────────────────
    op.add_column(
        "movimientos_cuenta_corriente",
        sa.Column(
            "aplicado_por_movimiento_id",
            sa.Integer,
            sa.ForeignKey("movimientos_cuenta_corriente.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "movimientos_cuenta_corriente",
        sa.Column("aplicado_en", sa.DateTime, nullable=True),
    )

    # ── El pago sabe de qué reserva es ──────────────────────────────────────
    op.add_column(
        "pagos",
        sa.Column("reserva_id", sa.Integer, sa.ForeignKey("reservas.id"), nullable=True),
    )
    op.create_index("ix_pagos_reserva_id", "pagos", ["reserva_id"])
    # Backfill por los dos puentes que ya existían: el movimiento de cuenta
    # corriente y `PagoWeb`.
    op.execute(
        "UPDATE pagos p SET reserva_id = m.reserva_id "
        "FROM movimientos_cuenta_corriente m "
        "WHERE m.pago_id = p.id AND m.reserva_id IS NOT NULL AND p.reserva_id IS NULL"
    )
    op.execute(
        "UPDATE pagos p SET reserva_id = pw.reserva_id FROM pagos_web pw "
        "WHERE pw.pago_id = p.id AND p.reserva_id IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_pagos_reserva_id", table_name="pagos")
    op.drop_column("pagos", "reserva_id")
    op.drop_column("movimientos_cuenta_corriente", "aplicado_en")
    op.drop_column("movimientos_cuenta_corriente", "aplicado_por_movimiento_id")
    op.drop_index("ix_movimientos_cc_naturaleza", table_name="movimientos_cuenta_corriente")
    op.drop_column("movimientos_cuenta_corriente", "naturaleza")
    sa.Enum(name="naturaleza_movimiento").drop(op.get_bind(), checkfirst=True)
