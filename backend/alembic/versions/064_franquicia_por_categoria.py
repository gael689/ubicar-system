"""064 - La franquicia es configuracion: base por categoria + escalera (D-53)

Plan de conexion (13/08). Antes la franquicia sin cobertura contratada
resolvia a `contrato.franquicia_default`, que por defecto es 0 -- el peor
valor posible: el alquiler MAS BARATO (el que no contrato nada) imprimia
"FRANQUICIA: $ 0", que se lee como "no pagas nada", exactamente al reves de
lo que significa.

El modelo correcto (Franco, 13/08): franquicia BASE (la mas alta, sin costo
extra) que baja en dos escalones pagando mas, como porcentaje del alquiler
del vehiculo -- no un monto fijo, porque "30% mas" no es lo mismo en un
Compacto de 3 dias que en una Pick-up de 20:

    base (solo seguro obligatorio)     -> franquicia mas alta   $0 extra
    cobertura intermedia ($500.000)    -> franquicia $500.000   +10%
    cobertura total                    -> franquicia $0         +30%

**Sin dato real todavia**, se cargan numeros genericos por categoria, a
pedido explicito del usuario (13/08), para que el sistema quede probable de
punta a punta ya mismo. Se corrigen desde Flota -> Categorias en cuanto
Franco confirme los reales -- son datos, no codigo.

Reutiliza los dos `adicionales` de cobertura que ya existen
(`demo_cob_basica`, `demo_cob_full`) en vez de crear duplicados: si no
existen (base sembrada distinta), los crea.

Revision ID: 064_franquicia_por_categoria
Revises: 063_ventana_web_configuracion
"""
import sqlalchemy as sa
from alembic import op

revision = "064_franquicia_por_categoria"
down_revision = "063_ventana_web_configuracion"
branch_labels = None
depends_on = None


# Compacto y Sedán: 1.500.000 · Sedán superior: 2.000.000 · Pick-up: 2.500.000
# (los cuatro dados por el usuario, 13/08). SUV se asimila a sedán superior
# por porte/valor, Furgón a pick-up por ser utilitario de carga -- son los
# dos que no se especificaron y quedan documentados como default razonable,
# no como dato confirmado.
FRANQUICIA_BASE_POR_CODIGO = {
    "compacto": "1500000",
    "sedan": "1500000",
    "sedan_superior": "2000000",
    "suv": "2000000",
    "pickup": "2500000",
    "furgon": "2500000",
}


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "adicionales",
        sa.Column("porcentaje_sobre_alquiler", sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        "categorias",
        sa.Column("franquicia_base", sa.Numeric(12, 2), nullable=True),
    )

    for codigo, valor in FRANQUICIA_BASE_POR_CODIGO.items():
        bind.execute(
            sa.text("UPDATE categorias SET franquicia_base = :valor WHERE codigo = :codigo"),
            {"valor": valor, "codigo": codigo},
        )

    # La cobertura intermedia: franquicia $500.000, +10% del alquiler.
    actualizado = bind.execute(
        sa.text("""
            UPDATE adicionales
            SET franquicia = 500000, porcentaje_sobre_alquiler = 10, precio = 0,
                nombre = 'Cobertura reducida', grupo = 'cobertura', activo = true,
                descripcion = 'Baja la franquicia a $500.000. +10% sobre el alquiler.'
            WHERE codigo = 'demo_cob_basica'
        """)
    )
    if actualizado.rowcount == 0:
        bind.execute(sa.text("""
            INSERT INTO adicionales (codigo, nombre, descripcion, grupo, precio, unidad_cobro,
                                      franquicia, porcentaje_sobre_alquiler, incluido, visible_web,
                                      orden, activo)
            VALUES ('cobertura_reducida', 'Cobertura reducida',
                    'Baja la franquicia a $500.000. +10% sobre el alquiler.',
                    'cobertura', 0, 'unico', 500000, 10, false, true, 1, true)
            ON CONFLICT (codigo) DO NOTHING
        """))

    # La cobertura total: franquicia $0, +30% del alquiler.
    actualizado = bind.execute(
        sa.text("""
            UPDATE adicionales
            SET franquicia = 0, porcentaje_sobre_alquiler = 30, precio = 0,
                nombre = 'Cobertura total', grupo = 'cobertura', activo = true,
                descripcion = 'Franquicia $0. No pagás nada ante un siniestro. +30% sobre el alquiler.'
            WHERE codigo = 'demo_cob_full'
        """)
    )
    if actualizado.rowcount == 0:
        bind.execute(sa.text("""
            INSERT INTO adicionales (codigo, nombre, descripcion, grupo, precio, unidad_cobro,
                                      franquicia, porcentaje_sobre_alquiler, incluido, visible_web,
                                      orden, activo)
            VALUES ('cobertura_total', 'Cobertura total',
                    'Franquicia $0. No pagás nada ante un siniestro. +30% sobre el alquiler.',
                    'cobertura', 0, 'unico', 0, 30, false, true, 2, true)
            ON CONFLICT (codigo) DO NOTHING
        """))


def downgrade() -> None:
    op.drop_column("categorias", "franquicia_base")
    op.drop_column("adicionales", "porcentaje_sobre_alquiler")
