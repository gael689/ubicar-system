"""El mostrador deja de pedir garantía por ahora

El bloque "Garantía / Depósito" del formulario de reserva —sin garantía /
efectivo / tarjeta / transferencia— se oculta mientras se define la política.

**Va como una clave de configuración y no borrando el bloque.** El sistema
sigue soportando la garantía entera: la columna, la caja, la devolución, la
ejecución parcial y los últimos cuatro dígitos de la tarjeta (migración 078).
Nada de eso se toca. Lo único que cambia es si el formulario la pide, y eso es
una decisión comercial que se prende y apaga desde Configuración, sin deploy.

**Y apaga también la advertencia del semáforo.** Con el bloque oculto ninguna
reserva puede tener garantía cargada, así que `sin_garantia` aparecería en
*todas*, para siempre y sin forma de resolverla. Una advertencia que está
siempre encendida no avisa de nada: enseña a ignorar la lista, que es
exactamente lo que el semáforo evita separando bloqueantes de avisos.
`domain/bloqueos.py` lee esta misma clave.

Se inserta la fila —en vez de confiar en el default `True` del código— para que
aparezca en la pantalla de Configuración, que renderiza las filas que existen.
Sin la fila, el interruptor no se podría volver a prender desde el panel.

Revision ID: 088_garantia_apagada
Revises: 087_solo_mid_incluida
"""
import sqlalchemy as sa
from alembic import op

revision = "088_garantia_apagada"
down_revision = "087_solo_mid_incluida"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
        VALUES (
            'reservas.pide_garantia', 'false', 'bool', 'reservas',
            'Si el formulario de reserva pide garantía/depósito. Apagado esconde '
            'el bloque y silencia la advertencia del semáforo. El sistema sigue '
            'soportando garantías: sólo deja de pedirlas al cargar.'
        )
        ON CONFLICT (clave) DO NOTHING
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "DELETE FROM configuracion WHERE clave = 'reservas.pide_garantia'"
    ))
