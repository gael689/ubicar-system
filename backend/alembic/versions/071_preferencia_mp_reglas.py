"""071 - La preferencia de Mercado Pago vence, y el tope de cuotas es editable

Dos cosas que le faltaban a la preferencia de Checkout Pro:

1. `pagos_web.vence_en` — hasta cuando Mercado Pago acepta que se pague esa
   preferencia. Antes no vencia nunca: alguien podia abrir el link al dia
   siguiente y pagar un auto cuyo hold habia vencido hacia horas. El pago
   entraba igual y caia en `revision_sin_cupo` para que lo resolviera una
   persona a mano.

   Se guarda en la tabla y no solo se manda a MP porque hace falta al
   **reusar** la preferencia: si el cliente aprieta "Darme mas tiempo"
   (`ContadorHold`), el hold se extiende pero la preferencia ya creada no. Sin
   esta columna no hay forma de saber que la que tenemos guardada ya murio, y
   el boton de pagar falla contra una preferencia vencida.

2. `web.mp_cuotas_maximas` — las cuotas las paga el vendedor, asi que cuantas
   mas, menos queda de cada reserva. Es una palanca comercial: la mueven los
   duenos desde Configuracion y no puede requerir un deploy.

   Seis es un default prudente hasta que Franco y Martin definan el suyo.
   Cero o vacio = lo que Mercado Pago ofrezca por defecto.

Revision ID: 071_preferencia_mp_reglas
Revises: 070_telefono_contacto_unificado
"""
import sqlalchemy as sa
from alembic import op

revision = "071_preferencia_mp_reglas"
down_revision = "070_telefono_contacto_unificado"
branch_labels = None
depends_on = None

CLAVE_CUOTAS = "web.mp_cuotas_maximas"
CUOTAS_DEFAULT = "6"
DESCRIPCION_CUOTAS = (
    "Hasta cuantas cuotas se ofrecen en Mercado Pago. El costo de la "
    "financiacion lo paga Ubicar, asi que mas cuotas es menos plata por "
    "reserva. En 0 se ofrece lo que Mercado Pago traiga por defecto."
)


def upgrade() -> None:
    op.add_column("pagos_web", sa.Column("vence_en", sa.DateTime(), nullable=True))
    op.get_bind().execute(
        sa.text("""
            INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
            VALUES (:clave, :valor, 'int', 'Reservas web', :descripcion)
            ON CONFLICT (clave) DO NOTHING
        """),
        {"clave": CLAVE_CUOTAS, "valor": CUOTAS_DEFAULT, "descripcion": DESCRIPCION_CUOTAS},
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM configuracion WHERE clave = :clave"), {"clave": CLAVE_CUOTAS}
    )
    op.drop_column("pagos_web", "vence_en")
