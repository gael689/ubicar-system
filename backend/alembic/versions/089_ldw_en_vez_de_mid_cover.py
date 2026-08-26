"""La cobertura incluida se llama como en el contrato, no "Mid Cover"

"Mid Cover" no existe. El contrato modelo del que sale todo el clausulado
nombra sólo dos coberturas —Top Cover y Super Top Cover— y al escalón incluido
lo imprime como **"Exención Por Daños (LDW)"**, sin nombre comercial.

La 085 lo bautizó "Mid Cover" para completar la escalera, y eso obligó a que la
cláusula 5 lo definiera: un nombre inventado en el anverso, con asterisco, que
no llevaba a ninguna cláusula si no se lo explicaba. Usar el nombre real ahorra
la definición y además dice qué es — una exención no es un seguro: la empresa
renuncia a reclamarle al cliente los daños del vehículo por encima de la
franquicia.

    Exención por Daños (LDW)*   incluida        franquicia base
    Top Cover**                 +10%            −$  500.000
    Super Top Cover***          +30%            −$1.000.000

**El código `cobertura_mid` NO cambia.** Es estable, ya está en producción y es
la clave con la que `contrato_clausulado.MARCAS_COBERTURA` resuelve el
asterisco. Renombrarlo obligaría a tocar ese mapa y a arriesgar que una
instalación quede con la marca perdida; el nombre es lo que se lee, y es lo
único que hace falta cambiar.

Va junto con el clausulado v3, que `ContratoService.plantilla_vigente()` publica
solo en el primer contrato después del deploy.

Revision ID: 089_ldw_no_mid_cover
Revises: 088_garantia_apagada
"""
import sqlalchemy as sa
from alembic import op

revision = "089_ldw_no_mid_cover"
down_revision = "088_garantia_apagada"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        UPDATE adicionales
        SET nombre = 'Exención por Daños (LDW)',
            descripcion = 'Incluida en el precio del alquiler, junto con el seguro de '
                          'responsabilidad civil. La franquicia es la base de la categoría.'
        WHERE codigo = 'cobertura_mid'
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        UPDATE adicionales SET nombre = 'Mid Cover' WHERE codigo = 'cobertura_mid'
    """))
