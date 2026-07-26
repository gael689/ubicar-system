"""018_fechas_date

Migra columnas de fecha que estaban guardadas como String(10) "YYYY-MM-DD" a
tipo Date real. Esta mezcla de tipos era la causa raíz del bug de
/notificaciones (comparar un date de Reserva contra un str de otras tablas
lanzaba TypeError) y de un bug análogo en /reportes/flota (max(date, str)).

Tablas afectadas: documentos, clientes, conductores_adicionales, pagos,
gastos, echeqs, movimientos_cuenta_corriente, reservas (anticipo_fecha).

Todas las tablas tenían 0 filas excepto clientes (1 fila) y reservas (varias),
verificado antes de escribir esta migración — todas las fechas existentes son
ISO "YYYY-MM-DD" válidas, por lo que el cast USING col::date es seguro.

`clientes.licencia_vencimiento` pasa a nullable=True: el formulario de alta ya
trata la licencia como opcional (ver docs/CASOS_DE_USO.md ítem CLI-11).

Revision ID: 018_fechas_date
Revises: 017_estado_reserva_vencida
Create Date: 2026-07-26
"""

from alembic import op

revision = '018_fechas_date'
down_revision = '017_estado_reserva_vencida'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE documentos ALTER COLUMN vigencia_desde TYPE DATE USING vigencia_desde::date")
    op.execute("ALTER TABLE documentos ALTER COLUMN vigencia_hasta TYPE DATE USING vigencia_hasta::date")

    op.execute("ALTER TABLE clientes ALTER COLUMN licencia_vencimiento TYPE DATE USING licencia_vencimiento::date")
    op.execute("ALTER TABLE clientes ALTER COLUMN licencia_vencimiento DROP NOT NULL")

    op.execute(
        "ALTER TABLE conductores_adicionales ALTER COLUMN licencia_vencimiento "
        "TYPE DATE USING licencia_vencimiento::date"
    )

    op.execute("ALTER TABLE pagos ALTER COLUMN fecha TYPE DATE USING fecha::date")
    op.execute("ALTER TABLE gastos ALTER COLUMN fecha TYPE DATE USING fecha::date")

    op.execute("ALTER TABLE echeqs ALTER COLUMN fecha_emision TYPE DATE USING fecha_emision::date")
    op.execute("ALTER TABLE echeqs ALTER COLUMN fecha_cobro TYPE DATE USING fecha_cobro::date")

    op.execute(
        "ALTER TABLE movimientos_cuenta_corriente ALTER COLUMN fecha "
        "TYPE DATE USING fecha::date"
    )

    op.execute("ALTER TABLE reservas ALTER COLUMN anticipo_fecha TYPE DATE USING anticipo_fecha::date")


def downgrade() -> None:
    op.execute("ALTER TABLE documentos ALTER COLUMN vigencia_desde TYPE VARCHAR(10) USING vigencia_desde::text")
    op.execute("ALTER TABLE documentos ALTER COLUMN vigencia_hasta TYPE VARCHAR(10) USING vigencia_hasta::text")

    op.execute("ALTER TABLE clientes ALTER COLUMN licencia_vencimiento TYPE VARCHAR(10) USING licencia_vencimiento::text")
    op.execute("ALTER TABLE clientes ALTER COLUMN licencia_vencimiento SET NOT NULL")

    op.execute(
        "ALTER TABLE conductores_adicionales ALTER COLUMN licencia_vencimiento "
        "TYPE VARCHAR(10) USING licencia_vencimiento::text"
    )

    op.execute("ALTER TABLE pagos ALTER COLUMN fecha TYPE VARCHAR(10) USING fecha::text")
    op.execute("ALTER TABLE gastos ALTER COLUMN fecha TYPE VARCHAR(10) USING fecha::text")

    op.execute("ALTER TABLE echeqs ALTER COLUMN fecha_emision TYPE VARCHAR(10) USING fecha_emision::text")
    op.execute("ALTER TABLE echeqs ALTER COLUMN fecha_cobro TYPE VARCHAR(10) USING fecha_cobro::text")

    op.execute(
        "ALTER TABLE movimientos_cuenta_corriente ALTER COLUMN fecha "
        "TYPE VARCHAR(10) USING fecha::text"
    )

    op.execute("ALTER TABLE reservas ALTER COLUMN anticipo_fecha TYPE VARCHAR(10) USING anticipo_fecha::text")
