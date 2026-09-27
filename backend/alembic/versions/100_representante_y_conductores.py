"""Representante de la empresa y hasta tres conductores por reserva

Pedido del cliente (27/09/2026, txt 20, 21 y 28):

1. **Representante de la empresa.** Una empresa firma por medio de una
   persona, y esa persona no estaba en ningún lado: el contrato imprimía la
   razón social como si fuera quien maneja. Cinco columnas en `clientes`
   (nombre, DNI, cargo, teléfono, email), todas opcionales — la mayoría de
   los clientes son particulares.
2. **El vencimiento de la licencia de un conductor deja de ser obligatorio.**
   Era la causa raíz de "cargué el conductor y no impactó en el contrato": el
   formulario mandaba el vencimiento vacío, la API contestaba 422 y el
   conductor nunca se guardaba — sin que la pantalla lo dijera. Se agrega
   también el domicilio, que la cláusula 2.h pide para autorizar a un
   conductor adicional y que el contrato ya intentaba leer.
3. **Hasta tres conductores por reserva** (`reserva_conductores`). La columna
   `reservas.conductor_id` queda como el conductor principal: es la que mira
   la edad mínima (D-51) y la que leen las reservas viejas. Se copia una fila
   por cada reserva que ya tenía conductor, así la tabla nueva cuenta la
   historia entera desde el primer día.

Revision ID: 100_representante_y_conductores
Revises: 099_motivo_baja_vehiculo
"""
import sqlalchemy as sa
from alembic import op

revision = "100_representante_y_conductores"
down_revision = "099_motivo_baja_vehiculo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clientes", sa.Column("representante_nombre", sa.String(255), nullable=True))
    op.add_column("clientes", sa.Column("representante_dni", sa.String(20), nullable=True))
    op.add_column("clientes", sa.Column("representante_cargo", sa.String(100), nullable=True))
    op.add_column("clientes", sa.Column("representante_telefono", sa.String(30), nullable=True))
    op.add_column("clientes", sa.Column("representante_email", sa.String(255), nullable=True))

    op.alter_column(
        "conductores_adicionales", "licencia_vencimiento",
        existing_type=sa.Date(), nullable=True,
    )
    op.add_column("conductores_adicionales", sa.Column("domicilio", sa.Text(), nullable=True))

    op.create_table(
        "reserva_conductores",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "reserva_id", sa.Integer(),
            sa.ForeignKey("reservas.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "conductor_id", sa.Integer(),
            sa.ForeignKey("conductores_adicionales.id"), nullable=False,
        ),
        sa.Column("orden", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.UniqueConstraint("reserva_id", "conductor_id", name="uq_reserva_conductor"),
    )
    op.create_index("ix_reserva_conductores_reserva_id", "reserva_conductores", ["reserva_id"])
    op.create_index("ix_reserva_conductores_conductor_id", "reserva_conductores", ["conductor_id"])

    # El conductor que cada reserva ya tenía pasa a ser el primero de su lista.
    op.execute(
        """
        INSERT INTO reserva_conductores (reserva_id, conductor_id, orden)
        SELECT id, conductor_id, 1 FROM reservas WHERE conductor_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_reserva_conductores_conductor_id", table_name="reserva_conductores")
    op.drop_index("ix_reserva_conductores_reserva_id", table_name="reserva_conductores")
    op.drop_table("reserva_conductores")
    op.drop_column("conductores_adicionales", "domicilio")
    # Volver a NOT NULL fallaría con conductores cargados sin vencimiento: se
    # completan con la fecha de hoy antes, que es el dato menos engañoso
    # (una licencia "vencida hoy" pide revisarla, no la da por buena).
    op.execute(
        "UPDATE conductores_adicionales SET licencia_vencimiento = CURRENT_DATE "
        "WHERE licencia_vencimiento IS NULL"
    )
    op.alter_column(
        "conductores_adicionales", "licencia_vencimiento",
        existing_type=sa.Date(), nullable=False,
    )
    op.drop_column("clientes", "representante_email")
    op.drop_column("clientes", "representante_telefono")
    op.drop_column("clientes", "representante_cargo")
    op.drop_column("clientes", "representante_dni")
    op.drop_column("clientes", "representante_nombre")
