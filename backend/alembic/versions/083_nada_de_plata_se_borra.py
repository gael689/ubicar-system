"""Ni un pago ni un gasto se borran: se dan de baja con motivo

Los dos únicos borrados físicos que quedaban en el sistema, y los dos sacan
plata de un día pasado sin dejar nada que cuente qué había.

**`DELETE /pagos/{id}`** hacía `db.delete(pago)`. Contradice de frente la regla
que gobierna todo el circuito —*el ledger nunca se edita, se compensa*— y el
comentario del código lo admitía: *"el único borrado real que quedó en el
sistema, y por eso el que más falta hace auditar: después del `delete` no queda
ninguna fila que pueda contar qué había ni quién la sacó"*. Auditaba antes de
borrar, que es lo mejor que se puede hacer sin cambiar el modelo, pero la caja
de esa fecha cambiaba y el cobro desaparecía del historial del cliente.

**`DELETE /gastos/{id}`** hacía lo mismo, y su docstring lo justificaba con
*"gastos no son entidad auditada en F1"*. Eso dejó de ser cierto: los gastos son
la mitad de "cuánto se gasta en la flota" (`/reportes/flota`) y ahora también
entran en el efectivo del cajón. Un número que se puede reescribir hacia atrás
sin rastro no sirve para decidir nada.

Cinco columnas, el mismo patrón que ya usan `echeqs`, `danios` y
`movimientos_caja`: baja lógica, motivo obligatorio, quién y cuándo.

Revision ID: 083_nada_se_borra
Revises: 082_vencimiento_provisorio
"""
import sqlalchemy as sa
from alembic import op

revision = "083_nada_se_borra"
down_revision = "082_vencimiento_provisorio"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for tabla in ("pagos", "gastos"):
        op.add_column(
            tabla,
            sa.Column("anulado", sa.Boolean, nullable=False, server_default="false"),
        )
        op.add_column(tabla, sa.Column("motivo_anulacion", sa.Text, nullable=True))
        op.add_column(
            tabla,
            sa.Column("anulado_por", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=True),
        )
        op.add_column(tabla, sa.Column("anulado_en", sa.DateTime, nullable=True))
        # Todo lo que se lee de estas tablas filtra por `anulado = false`, así
        # que el índice lo usa la caja del día, el reporte de flota y el
        # efectivo del cajón.
        op.create_index(f"ix_{tabla}_anulado", tabla, ["anulado"])


def downgrade() -> None:
    for tabla in ("pagos", "gastos"):
        op.drop_index(f"ix_{tabla}_anulado", table_name=tabla)
        op.drop_column(tabla, "anulado_en")
        op.drop_column(tabla, "anulado_por")
        op.drop_column(tabla, "motivo_anulacion")
        op.drop_column(tabla, "anulado")
