"""008_pre_fase3_estado_real

Migración correctiva pre-Fase 3.
- Convierte campos String → Date/Time en reservas y alquileres
- Renombra horas_excedente → horas_excedidas y bonificado_por → decidido_por en alquileres
- Agrega campos nuevos en alquileres y reservas para D1, D2, D6
- Crea índices de rendimiento para queries de solapamiento y ocupación

Revision ID: 008_pre_fase3
Revises: ee30672ffb67
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "008_pre_fase3"
down_revision = "ee30672ffb67"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── RESERVAS: String → Date/Time ──────────────────────────────────────────
    op.alter_column(
        "reservas", "fecha_inicio",
        existing_type=sa.String(10),
        type_=sa.Date(),
        postgresql_using="fecha_inicio::date",
        nullable=False,
    )
    op.alter_column(
        "reservas", "fecha_fin",
        existing_type=sa.String(10),
        type_=sa.Date(),
        postgresql_using="fecha_fin::date",
        nullable=False,
    )
    op.alter_column(
        "reservas", "hora_inicio",
        existing_type=sa.String(5),
        type_=sa.Time(),
        postgresql_using="hora_inicio::time",
        nullable=False,
    )
    op.alter_column(
        "reservas", "hora_fin",
        existing_type=sa.String(5),
        type_=sa.Time(),
        postgresql_using="hora_fin::time",
        nullable=False,
    )

    # ── RESERVAS: campos nuevos F3 ────────────────────────────────────────────
    op.add_column("reservas", sa.Column("notas", sa.Text(), nullable=True))
    op.add_column("reservas", sa.Column(
        "hora_devolucion_acordada", sa.Time(), nullable=True
    ))
    op.add_column("reservas", sa.Column(
        "late_checkout", sa.Boolean(), server_default="false", nullable=False
    ))
    op.add_column("reservas", sa.Column(
        "cargo_late_checkout", sa.Numeric(12, 2), server_default="0", nullable=False
    ))
    op.add_column("reservas", sa.Column(
        "tarifa_aplicada_id", sa.Integer(),
        sa.ForeignKey("tarifas.id"), nullable=True
    ))
    op.add_column("reservas", sa.Column(
        "precio_total", sa.Numeric(12, 2), nullable=True
    ))
    op.add_column("reservas", sa.Column(
        "bloqueada_por_solape", sa.Boolean(), server_default="false", nullable=False
    ))

    # ── ALQUILERES: String → Date/Time ────────────────────────────────────────
    op.alter_column(
        "alquileres", "checkout_fecha",
        existing_type=sa.String(10),
        type_=sa.Date(),
        postgresql_using="checkout_fecha::date",
        nullable=False,
    )
    op.alter_column(
        "alquileres", "checkout_hora",
        existing_type=sa.String(5),
        type_=sa.Time(),
        postgresql_using="checkout_hora::time",
        nullable=False,
    )
    op.alter_column(
        "alquileres", "checkin_fecha",
        existing_type=sa.String(10),
        type_=sa.Date(),
        postgresql_using="checkin_fecha::date",
        existing_nullable=True,
        nullable=True,
    )
    op.alter_column(
        "alquileres", "checkin_hora",
        existing_type=sa.String(5),
        type_=sa.Time(),
        postgresql_using="checkin_hora::time",
        existing_nullable=True,
        nullable=True,
    )

    # ── ALQUILERES: renombres ─────────────────────────────────────────────────
    op.alter_column(
        "alquileres", "horas_excedente",
        new_column_name="horas_excedidas",
    )
    op.alter_column(
        "alquileres", "bonificado_por",
        new_column_name="decidido_por",
    )

    # ── ALQUILERES: campos nuevos F3 ──────────────────────────────────────────
    op.add_column("alquileres", sa.Column(
        "horas_cobradas", sa.Numeric(6, 2), nullable=True
    ))
    op.add_column("alquileres", sa.Column(
        "motivo_bonificacion", sa.Text(), nullable=True
    ))
    op.add_column("alquileres", sa.Column(
        "checkout_registrado_en_tiempo_real",
        sa.Boolean(), server_default="true", nullable=False
    ))
    op.add_column("alquileres", sa.Column(
        "checkin_registrado_en_tiempo_real",
        sa.Boolean(), server_default="true", nullable=False
    ))

    # ── Índices de rendimiento ────────────────────────────────────────────────
    op.create_index(
        "ix_reservas_vehiculo_fecha_inicio",
        "reservas", ["vehiculo_id", "fecha_inicio"],
    )
    op.create_index(
        "ix_alquileres_checkout_fecha",
        "alquileres", ["checkout_fecha"],
    )


def downgrade() -> None:
    # Quitar índices
    op.drop_index("ix_alquileres_checkout_fecha", table_name="alquileres")
    op.drop_index("ix_reservas_vehiculo_fecha_inicio", table_name="reservas")

    # Revertir alquileres
    op.drop_column("alquileres", "checkin_registrado_en_tiempo_real")
    op.drop_column("alquileres", "checkout_registrado_en_tiempo_real")
    op.drop_column("alquileres", "motivo_bonificacion")
    op.drop_column("alquileres", "horas_cobradas")
    op.alter_column("alquileres", "decidido_por", new_column_name="bonificado_por")
    op.alter_column("alquileres", "horas_excedidas", new_column_name="horas_excedente")
    op.alter_column("alquileres", "checkin_hora", existing_type=sa.Time(), type_=sa.String(5))
    op.alter_column("alquileres", "checkin_fecha", existing_type=sa.Date(), type_=sa.String(10))
    op.alter_column("alquileres", "checkout_hora", existing_type=sa.Time(), type_=sa.String(5))
    op.alter_column("alquileres", "checkout_fecha", existing_type=sa.Date(), type_=sa.String(10))

    # Revertir reservas
    op.drop_column("reservas", "bloqueada_por_solape")
    op.drop_column("reservas", "precio_total")
    op.drop_column("reservas", "tarifa_aplicada_id")
    op.drop_column("reservas", "cargo_late_checkout")
    op.drop_column("reservas", "late_checkout")
    op.drop_column("reservas", "hora_devolucion_acordada")
    op.drop_column("reservas", "notas")
    op.alter_column("reservas", "hora_fin", existing_type=sa.Time(), type_=sa.String(5))
    op.alter_column("reservas", "hora_inicio", existing_type=sa.Time(), type_=sa.String(5))
    op.alter_column("reservas", "fecha_fin", existing_type=sa.Date(), type_=sa.String(10))
    op.alter_column("reservas", "fecha_inicio", existing_type=sa.Date(), type_=sa.String(10))
