"""059 - Datos bancarios para cobrar por transferencia, y el IIBB que faltaba

Dos cosas que no se pueden escribir en el codigo:

1. **La cuenta bancaria.** Es el ultimo dato que faltaba para poder cobrar sin
   Mercado Pago. Va en `configuracion` y no en el HTML de la web porque un CBU
   pisado en el front es un CBU que un dia cambia y nadie corrige — y el
   sintoma es que la plata de un cliente se va a una cuenta que ya no existe.

2. **Ingresos Brutos.** Era el ultimo dato fiscal pendiente de D-C1. Sale de la
   constancia de ARBA del 03/09/2024: FINAR es **contribuyente DIRECTO de la
   Provincia de Buenos Aires**, no de Convenio Multilateral — coherente con
   D-39, que dejo la operacion solo en Bahia Blanca. Para un contribuyente
   directo el numero de inscripcion **es el CUIT**, asi que se carga con ese
   valor y la descripcion lo explica: sin la aclaracion, dentro de seis meses
   alguien lo va a "corregir" pensando que se copio mal.

Es idempotente: no pisa ningun valor ya cargado.

Revision ID: 059_transferencia_y_iibb
Revises: 058_tarifa_generica
"""
import sqlalchemy as sa
from alembic import op

revision = "059_transferencia_y_iibb"
down_revision = "058_tarifa_generica"
branch_labels = None
depends_on = None


# Los datos de la cuenta a la que el cliente transfiere.
CONFIG_BANCO = [
    ("cobro.transferencia_habilitada", "true", "bool",
     "Si la web ofrece transferencia bancaria como forma de pago"),
    ("cobro.banco_titular", "FINAR GRUPO FINANCIERO S.R.L.", "string",
     "Titular de la cuenta, tal como figura en el banco"),
    ("cobro.banco_alias", "finar.pesospatagonia", "string", "Alias de la cuenta"),
    ("cobro.banco_cbu", "0340287208287012104005", "string", "CBU de la cuenta"),
    ("cobro.banco_cuenta", "CA $ 287-287012104-000", "string",
     "Tipo y numero de cuenta"),
    ("cobro.banco_cuit", "30-71756601-3", "string", "CUIT del titular de la cuenta"),
    ("cobro.whatsapp_comprobante", "+5492932474791", "string",
     "WhatsApp al que el cliente manda el comprobante de la transferencia"),
]

# El valor real, y el porque de que sea el CUIT.
IIBB = (
    "30-71756601-3",
    "Ingresos Brutos. Contribuyente DIRECTO de la Provincia de Buenos Aires "
    "(no Convenio Multilateral), por lo que el numero de inscripcion es el "
    "propio CUIT. Constancia de ARBA del 03/09/2024, transaccion 10855047, "
    "distrito Bahia Blanca (007), alta 01/11/2022, regimen mensual.",
)


def upgrade() -> None:
    conn = op.get_bind()

    for clave, valor, tipo, descripcion in CONFIG_BANCO:
        conn.execute(
            sa.text("""
                INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
                VALUES (:clave, :valor, :tipo, 'Cobros', :descripcion)
                ON CONFLICT (clave) DO NOTHING
            """),
            {"clave": clave, "valor": valor, "tipo": tipo, "descripcion": descripcion},
        )

    # Solo si sigue vacio: si alguien ya lo cargo a mano, ese valor manda.
    valor, descripcion = IIBB
    conn.execute(
        sa.text("""
            UPDATE configuracion
            SET valor = :valor, descripcion = :descripcion
            WHERE clave = 'empresa.ingresos_brutos'
              AND (valor IS NULL OR valor = '')
        """),
        {"valor": valor, "descripcion": descripcion},
    )


def downgrade() -> None:
    conn = op.get_bind()
    claves = [c[0] for c in CONFIG_BANCO]
    conn.execute(
        sa.text("DELETE FROM configuracion WHERE clave = ANY(:claves)"),
        {"claves": claves},
    )
    # El IIBB vuelve a vacio: es el estado del que venia.
    conn.execute(sa.text(
        "UPDATE configuracion SET valor = '' WHERE clave = 'empresa.ingresos_brutos'"
    ))
