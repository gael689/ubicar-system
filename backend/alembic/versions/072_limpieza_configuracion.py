"""Limpieza de configuración: saca una clave muerta y empareja los grupos.

Fase 2 de la reestructuración. Tres cosas chicas que hacen que la pantalla de
Configuración mienta o se lea mal.

**1. Se elimina `contrato.franquicia_default`.**

La sembró la migración 046 y **ningún código la lee** — verificado: sólo
aparece en dos comentarios (`contrato_service.py:339` y el encabezado de la
064), los dos explicando que ya *no* se usa. La franquicia sale de la categoría
del vehículo entregado (D-64) o de la cobertura contratada.

El problema de dejarla no es que ocupe lugar: es que **vale `0` y está a la
vista en la pantalla de Configuración**, dentro del grupo "Empresa". Cualquiera
que la mire concluye que la franquicia por defecto del sistema es cero, que es
exactamente la lectura que la 064 se propuso eliminar. Una perilla que no hace
nada y además desinforma.

**2. `control_24hs` pasa a llamarse "Control de 24hs".**

Es el único de los siete grupos en snake_case; los otros seis son Título. Se
ordena mal en la pantalla y se lee como un nombre de tabla.

**3. Las claves del canal web quedan juntas.**

Los datos bancarios y el WhatsApp del comprobante estaban en "Cobros", separados
de la ventana de venta, aunque son la misma decisión operativa: cómo cobra el
sitio. Pasan a "Reservas web", que es el grupo que la Fase 6 convierte en la
pantalla "Canal web".

Nada de esto toca el comportamiento del sistema: `configuracion.categoria` sólo
agrupa filas en la interfaz, no se lee desde ningún cálculo.
"""
from alembic import op
import sqlalchemy as sa


revision = "072_limpieza_configuracion"
down_revision = "071_preferencia_mp_reglas"
branch_labels = None
depends_on = None


# Las de `cobro.*` son la contracara de la ventana de venta: qué se cobra y por
# dónde. Van con el resto de lo del sitio.
CLAVES_A_CANAL_WEB = (
    "cobro.transferencia_habilitada",
    "cobro.banco_titular",
    "cobro.banco_cbu",
    "cobro.banco_alias",
    "cobro.banco_cuenta",
    "cobro.banco_cuit",
    "cobro.whatsapp_comprobante",
)


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text(
        "DELETE FROM configuracion WHERE clave = 'contrato.franquicia_default'"
    ))

    conn.execute(sa.text(
        "UPDATE configuracion SET categoria = 'Control de 24hs' "
        "WHERE categoria = 'control_24hs'"
    ))

    conn.execute(
        sa.text(
            "UPDATE configuracion SET categoria = 'Reservas web' "
            "WHERE clave IN :claves"
        ).bindparams(sa.bindparam("claves", expanding=True)),
        {"claves": list(CLAVES_A_CANAL_WEB)},
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            "UPDATE configuracion SET categoria = 'Cobros' WHERE clave IN :claves"
        ).bindparams(sa.bindparam("claves", expanding=True)),
        {"claves": list(CLAVES_A_CANAL_WEB)},
    )

    conn.execute(sa.text(
        "UPDATE configuracion SET categoria = 'control_24hs' "
        "WHERE categoria = 'Control de 24hs'"
    ))

    # Se repone con el mismo valor y descripción que puso la 046, para que
    # bajar y volver a subir deje la tabla igual que antes.
    conn.execute(sa.text("""
        INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion, updated_at)
        VALUES ('contrato.franquicia_default', '0', 'decimal', 'Empresa',
                'Franquicia por defecto del contrato', NOW())
        ON CONFLICT (clave) DO NOTHING
    """))
