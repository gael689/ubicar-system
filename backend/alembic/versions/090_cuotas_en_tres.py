"""El tope de cuotas de la web baja a 3, y aparece en Configuración

`web.mp_cuotas_maximas` existía como clave en el código con default 6, pero
**sin fila en `configuracion`**. La pantalla de Configuración renderiza las
filas que existen, así que el tope no se podía ver ni cambiar desde el panel:
el valor efectivo era 6 y no había forma de saberlo mirando el sistema.

Se crea la fila con el valor decidido por los dueños (**3**) y queda editable
sin deploy, que es lo que la clave prometía desde el principio.

**Por qué 3 no cuesta nada.** La cuenta de Mercado Pago está configurada "con
interés", o sea que el costo financiero lo paga el cliente: verificado el
26/08/2026 contra `/v1/payment_methods/installments`, en 3 cuotas la tasa es
19,69 % y Ubicar cobra el monto completo igual. El número de cuotas sólo sería
un costo si alguien pasara la cuenta a "sin interés" desde el panel de Mercado
Pago — ese interruptor no vive acá y el sistema no lo puede leer.

`ON CONFLICT DO UPDATE` y no `DO NOTHING`: si la fila ya existiera con otro
valor, lo que se quiere es el 3.

Revision ID: 090_cuotas_en_tres
Revises: 089_ldw_no_mid_cover
"""
import sqlalchemy as sa
from alembic import op

revision = "090_cuotas_en_tres"
down_revision = "089_ldw_no_mid_cover"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
        VALUES (
            'web.mp_cuotas_maximas', '3', 'int', 'web',
            'Hasta cuántas cuotas se ofrecen al pagar por el sitio con Mercado Pago. '
            'En 0 se ofrece lo que Mercado Pago traiga por default. Quién paga el '
            'interés NO se configura acá: eso se decide en el panel de Mercado Pago.'
        )
        ON CONFLICT (clave) DO UPDATE SET valor = '3'
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "DELETE FROM configuracion WHERE clave = 'web.mp_cuotas_maximas'"
    ))
