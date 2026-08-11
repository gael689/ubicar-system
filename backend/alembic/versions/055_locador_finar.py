"""D-C1 cerrada: el locador es FINAR GRUPO FINANCIERO S.R.L.

**"Ubicar Rent" no existe como persona juridica.** Es el nombre comercial con
el que opera FINAR GRUPO FINANCIERO S.R.L., y hasta ahora el contrato lo usaba
como si fuera la parte que se obliga: las trece clausulas decian "UBICAR RENT
se obliga a...". Un contrato firmado contra un nombre que no es sujeto de
derecho es un contrato que hay que discutir antes de poder ejecutarlo.

Datos tomados de la constancia de inscripcion de ARCA (vigencia 10-06-2026):

    Razon social       FINAR GRUPO FINANCIERO S. R. L.
    CUIT               30-71756601-3
    Forma juridica     S.R.L., contrato social del 01-04-2022
    Domicilio fiscal   PARAGUAY 241, Piso 9, Dpto A - Bahia Blanca (8000), Bs. As.
    Actividad          771190 - Alquiler de vehiculos automotores sin conductor

**Ingresos Brutos queda vacio a proposito.** No figura en la constancia de
ARCA, que es nacional; el numero de IIBB (provincial o de Convenio
Multilateral) hay que pedirlo. Un numero inventado en un contrato es peor que
un espacio en blanco: el blanco se nota y se completa, el relleno se firma.

Se agrega `empresa.nombre_comercial` para que el papel pueda decir las dos
cosas sin mentir ninguna: el logo y el encabezado siguen siendo Ubicar Rent
—que es lo que el cliente reconoce— y el clausulado y el pie fiscal nombran a
FINAR, que es quien se obliga.

**No toca los contratos ya emitidos.** Cada uno congelo su bloque `empresa` en
el snapshot al emitirse; reimprimir uno viejo tiene que seguir dando el papel
que se firmo.

Revision ID: 055_locador_finar
Revises: 054_escalera_duracion
"""
from alembic import op
import sqlalchemy as sa


revision = "055_locador_finar"
down_revision = "054_escalera_duracion"
branch_labels = None
depends_on = None


RAZON_SOCIAL = "FINAR GRUPO FINANCIERO S.R.L."

# (clave, valor, pisar_si_ya_tiene_valor)
#
# El tercer campo distingue los datos que definen la identidad legal —que hay
# que corregir si o si, porque hoy dicen "UBICAR RENT"— de los de contacto, que
# alguien pudo haber ajustado desde la pantalla de Configuracion y no
# corresponde revertir.
VALORES = [
    ("empresa.locador_nombre", RAZON_SOCIAL, True),
    ("empresa.razon_social", RAZON_SOCIAL, True),
    ("empresa.cuit", "30-71756601-3", True),
    ("empresa.domicilio", "Paraguay 241, Piso 9, Dpto. A", False),
    ("empresa.localidad", "Bahia Blanca (8000), Provincia de Buenos Aires", False),
]

NUEVAS = [
    ("empresa.nombre_comercial", "Ubicar Rent", "string",
     "Nombre de fantasia. Encabeza el papel; el que se obliga es la razon social"),
]


def upgrade() -> None:
    conn = op.get_bind()

    for clave, valor, tipo, descripcion in NUEVAS:
        conn.execute(sa.text("""
            INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion, updated_at)
            VALUES (:clave, :valor, :tipo, 'Empresa', :descripcion, NOW())
            ON CONFLICT (clave) DO NOTHING
        """).bindparams(clave=clave, valor=valor, tipo=tipo, descripcion=descripcion))

    for clave, valor, pisar in VALORES:
        if pisar:
            condicion = ""
        else:
            # Solo completa el hueco: si ya hay algo cargado, se respeta.
            condicion = " AND (valor IS NULL OR TRIM(valor) = '')"
        conn.execute(
            sa.text(
                f"UPDATE configuracion SET valor = :valor, updated_at = NOW() "
                f"WHERE clave = :clave{condicion}"
            ).bindparams(clave=clave, valor=valor)
        )

    # Que quede escrito en la propia clave por que sigue vacia, para que quien
    # abra Configuracion sepa que hay que pedirlo y no lo lea como un olvido.
    conn.execute(sa.text("""
        UPDATE configuracion
        SET descripcion = 'Numero de Ingresos Brutos. NO figura en la constancia de ARCA '
                          '(es nacional): hay que pedirlo a la contadora. Provincial o '
                          'Convenio Multilateral.'
        WHERE clave = 'empresa.ingresos_brutos'
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE FROM configuracion WHERE clave = 'empresa.nombre_comercial'"
    ))
    # Los datos fiscales NO se revierten a vacio: borrar un CUIT correcto para
    # volver a un placeholder haria que todos los contratos nuevos salieran
    # marcados como provisorios.
