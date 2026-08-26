"""Las coberturas pasan a llamarse Mid / Top / Super Top Cover, y aparece Ruedas y Vidrios

Dos cambios que van juntos porque los dos salen del contrato.

**1. Los nombres.** El clausulado que se adoptó (D-33) referencia las
coberturas con marcas de nota al pie —`Top Cover**`, `Super Top Cover***`— y
el anverso imprime la contratada con el mismo asterisco. Ese mecanismo sólo
funciona si el catálogo usa esos nombres: "Cobertura reducida**" no lleva a
ninguna cláusula.

Aparece además un tercer escalón, **Mid Cover**, que es el que ya existía sin
nombre: la Exención por Daños (LDW) incluida en el canon, con la franquicia
base de la categoría. Tenerlo cargado como adicional `incluido` es lo que hace
que el paso 2 de la web arranque mostrando qué trae el precio en vez de una
lista donde lo primero es un cargo.

Y **"Cobertura total" desaparece**, que era el punto: no existe la cobertura
total. La franquicia nunca baja de `FRANQUICIA_MINIMA` ($500.000), así que un
producto que se llama "total" promete algo que el sistema no hace. Es la misma
razón por la que el clausulado v2 no copia la "Reducción de la Franquicia a
CERO" del contrato modelo.

    sin cobertura no es una opción: Mid Cover viene incluida
    Mid Cover*          incluida        franquicia base de la categoría
    Top Cover**         +10%            −$  500.000
    Super Top Cover***  +30%            −$1.000.000

Los porcentajes y los descuentos **no se tocan**: son los que ya estaban
cargados y los que la 084 dejó bien. Acá sólo cambian los nombres, los códigos
y las descripciones.

**2. Protección Ruedas y Vidrios.** Cláusula 5: contratar cualquiera de las
tres coberturas **excluye** ruedas y vidrios, y para eso existe una protección
aparte. Hasta ahora la cláusula lo decía y el producto no existía, así que no
había forma de contratarlo — el contrato remitía a algo que no se podía
comprar.

Se siembra **con precio 0 y fuera de la web** a propósito. El precio lo ponen
los dueños (`adicionales` es un ABM justamente por eso) y publicar en la web un
extra a $0 lo regalaría. Queda visible en el catálogo del mostrador para que se
lo encuentre y se le cargue el precio.

Las coberturas se identifican **por el porcentaje sobre el alquiler**, no por
el código ni el nombre: según de qué base venga la instalación, los códigos son
`cobertura_reducida`/`cobertura_total` o `demo_cob_basica`/`demo_cob_full`. El
porcentaje es el dato que está bien en las dos. Mismo criterio que la 084.

Revision ID: 085_coberturas_con_nombre
Revises: 084_franquicia_descuento
"""
import sqlalchemy as sa
from alembic import op

revision = "085_coberturas_con_nombre"
down_revision = "084_franquicia_descuento"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── Top Cover (el +10%) ───────────────────────────────────────────────
    bind.execute(sa.text("""
        UPDATE adicionales
        SET codigo = 'cobertura_top',
            nombre = 'Top Cover',
            descripcion = 'Cobertura adicional: baja la franquicia en $500.000. '
                          '+10% sobre el alquiler.',
            orden = 2
        WHERE grupo = 'cobertura' AND porcentaje_sobre_alquiler = 10
    """))

    # ── Super Top Cover (el +30%) ─────────────────────────────────────────
    bind.execute(sa.text("""
        UPDATE adicionales
        SET codigo = 'cobertura_super_top',
            nombre = 'Super Top Cover',
            descripcion = 'Cobertura adicional: baja la franquicia en $1.000.000. '
                          '+30% sobre el alquiler.',
            orden = 3
        WHERE grupo = 'cobertura' AND porcentaje_sobre_alquiler = 30
    """))

    # ── Mid Cover, el escalón incluido ────────────────────────────────────
    #
    # `franquicia_descuento` queda en NULL y no en 0: no descuenta nada, y un 0
    # haría que el anverso imprima "baja la franquicia en $ 0", que se lee como
    # un error de carga. NULL es "no descuenta", que es la verdad.
    #
    # `porcentaje_sobre_alquiler = 0` y no NULL para que `PrecioService` la
    # trate como las otras dos —cobertura por porcentaje— y resuelva $0 sin
    # ningún caso especial.
    bind.execute(sa.text("""
        INSERT INTO adicionales (codigo, nombre, descripcion, grupo, precio, unidad_cobro,
                                 franquicia_descuento, porcentaje_sobre_alquiler,
                                 incluido, visible_web, orden, activo)
        VALUES ('cobertura_mid', 'Mid Cover',
                'Exención por Daños (LDW) y seguro de responsabilidad civil, incluidos '
                'en el precio del alquiler. La franquicia es la base de la categoría.',
                'cobertura', 0, 'unico', NULL, 0, true, true, 1, true)
        ON CONFLICT (codigo) DO NOTHING
    """))

    # ── Protección Ruedas y Vidrios ───────────────────────────────────────
    bind.execute(sa.text("""
        INSERT INTO adicionales (codigo, nombre, descripcion, grupo, precio, unidad_cobro,
                                 franquicia_descuento, porcentaje_sobre_alquiler,
                                 incluido, visible_web, orden, activo)
        VALUES ('proteccion_ruedas_vidrios', 'Protección Ruedas y Vidrios',
                'Cubre ruedas y cristales, que ninguna cobertura incluye (cláusula 5). '
                'Se contrata aparte y se puede sumar a cualquier cobertura. '
                'FALTA CARGARLE EL PRECIO: hasta entonces no se publica en la web.',
                'extra', 0, 'por_dia', NULL, NULL, false, false, 10, true)
        ON CONFLICT (codigo) DO NOTHING
    """))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM adicionales WHERE codigo = 'proteccion_ruedas_vidrios'"))
    bind.execute(sa.text("DELETE FROM adicionales WHERE codigo = 'cobertura_mid'"))
    bind.execute(sa.text("""
        UPDATE adicionales SET codigo = 'cobertura_reducida', nombre = 'Cobertura reducida'
        WHERE codigo = 'cobertura_top'
    """))
    bind.execute(sa.text("""
        UPDATE adicionales SET codigo = 'cobertura_total', nombre = 'Cobertura total'
        WHERE codigo = 'cobertura_super_top'
    """))
