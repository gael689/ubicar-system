"""046_contratos

Modulo de Contratos (Fase 4, items 50-51). Plan en docs/PLAN_CONTRATOS.md.

Dos ideas ordenan el diseno:

1. **El clausulado va versionado en `contrato_plantillas`**, no hardcodeado en
   el generador de PDF. Un contrato firmado tiene que poder reimprimirse
   EXACTAMENTE como se firmo, aunque despues se corrija una clausula. Si el
   texto viviera en el codigo, corregir una coma reescribiria el pasado.

2. **`contratos.snapshot` congela el anverso ya resuelto.** Renderizar contra
   las tablas vivas produciria, dos anios despues, un PDF distinto del que el
   cliente firmo — que es exactamente lo que un contrato no puede hacer. Es
   ademas lo que permite que los datos sean editables antes de generar: se
   guarda lo corregido, no lo que decia el sistema.

Los datos de la empresa van a `configuracion` y no al codigo: el locador
todavia no esta definido (D-C1) y ademas los necesitan tambien el recibo, el
comprobante y el PDF de reserva, que hoy tienen el contacto escrito a mano.

Revision ID: 046_contratos
Revises: 045_multa_vencimiento
"""
from alembic import op
import sqlalchemy as sa


revision = '046_contratos'
down_revision = '045_multa_vencimiento'
branch_labels = None
depends_on = None


# D-C1 PENDIENTE. Los campos fiscales quedan VACIOS a proposito: un CUIT
# inventado o un "XX-XXXXXXXX-X" en un contrato es peor que un espacio en
# blanco — el blanco se nota y se completa, el relleno se firma. El generador
# avisa mientras `empresa.cuit` este vacio.
CONFIG_EMPRESA = [
    ("empresa.locador_nombre", "UBICAR RENT", "string",
     "Nombre del locador tal como aparece en las clausulas del contrato (D-C1 pendiente)"),
    ("empresa.razon_social", "", "string", "Razon social para el pie del contrato"),
    ("empresa.cuit", "", "string", "CUIT. Mientras este vacio, el contrato avisa que le faltan datos fiscales"),
    ("empresa.ingresos_brutos", "", "string", "Numero de Ingresos Brutos"),
    ("empresa.domicilio", "", "string", "Domicilio fiscal"),
    ("empresa.localidad", "Bahia Blanca, Provincia de Buenos Aires", "string", "Localidad"),
    ("empresa.telefonos", "+54 9 291 4180554", "string", "Telefonos de contacto"),
    ("empresa.email", "ubicar.rent@gmail.com", "string", "Email de contacto"),
    ("empresa.jurisdiccion", "Bahia Blanca", "string",
     "Jurisdiccion de la clausula 13 (D-33: Bahia Blanca, no Capital Federal)"),
    ("contrato.franquicia_default", "0", "decimal",
     "Franquicia a cargo del cliente cuando no contrato ninguna cobertura (D-C3)"),
]


def upgrade() -> None:
    # ── Clausulado versionado ─────────────────────────────────────────────
    op.create_table(
        'contrato_plantillas',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('version', sa.Integer(), nullable=False, unique=True),
        sa.Column('titulo', sa.String(255), nullable=False),
        # [{numero, titulo, parrafos: [{texto, subrayados: [[ini,fin]]}]}]
        # JSON estructurado y no HTML: los subrayados son parte del documento
        # legal y el generador necesita saber donde van. Guardar markup
        # invitaria a que alguien pegue HTML roto en un contrato.
        sa.Column('clausulas', sa.JSON(), nullable=False),
        sa.Column('vigente_desde', sa.Date(), nullable=False),
        sa.Column('activa', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('creado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
    )

    # ── Contratos: se reemplaza la tabla vieja, que nunca se uso ──────────
    # La tabla `contratos` existia desde el esquema inicial pero jamas se
    # escribio una fila (el router era un stub de 19 lineas). Se le agregan
    # las columnas nuevas en vez de recrearla, para no perder la FK a
    # alquileres ni el historial de migraciones.
    op.add_column('contratos', sa.Column('numero', sa.Integer(), nullable=True))
    op.add_column('contratos', sa.Column('prefijo', sa.String(5), nullable=False, server_default='C'))
    op.add_column('contratos', sa.Column('plantilla_id', sa.Integer(),
                                         sa.ForeignKey('contrato_plantillas.id'), nullable=True))
    # Todo el anverso ya resuelto: cliente, conductor, vehiculo, fechas, km,
    # cargos, coberturas, franquicia, totales y operador.
    op.add_column('contratos', sa.Column('snapshot', sa.JSON(), nullable=True))
    op.add_column('contratos', sa.Column('firmado_at', sa.DateTime(), nullable=True))
    op.add_column('contratos', sa.Column('firma_key', sa.String(512), nullable=True))
    op.add_column('contratos', sa.Column('firmado_por_nombre', sa.String(255), nullable=True))
    op.add_column('contratos', sa.Column('firmado_por_dni', sa.String(20), nullable=True))
    op.add_column('contratos', sa.Column('atendido_por', sa.Integer(),
                                         sa.ForeignKey('usuarios.id'), nullable=True))
    op.add_column('contratos', sa.Column('anulado', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('contratos', sa.Column('motivo_anulacion', sa.Text(), nullable=True))
    op.add_column('contratos', sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('contratos', sa.Column('creado_por', sa.Integer(),
                                         sa.ForeignKey('usuarios.id'), nullable=True))

    # La unicidad de alquiler_id se relaja: un contrato anulado y uno nuevo
    # para el mismo alquiler tienen que poder convivir (se anula el papel mal
    # impreso y se emite otro).
    #
    # Venia como INDICE unico (`unique=True, index=True` en el modelo), no como
    # constraint con nombre — por eso se dropea el indice y se recrea sin
    # unicidad, en vez de un DROP CONSTRAINT que no existe.
    op.drop_index('ix_contratos_alquiler_id', table_name='contratos')
    op.create_index('ix_contratos_alquiler_id', 'contratos', ['alquiler_id'])

    op.execute("CREATE SEQUENCE IF NOT EXISTS contratos_numero_seq START 1")
    op.execute("ALTER TABLE contratos ALTER COLUMN numero SET DEFAULT nextval('contratos_numero_seq')")

    # ── D-34: constancia de entrega sin contrato ──────────────────────────
    # No se bloquea el check-out, pero queda constancia VISIBLE — no un dato
    # enterrado en la auditoria.
    op.add_column('alquileres', sa.Column('entregado_sin_contrato', sa.Boolean(),
                                          nullable=False, server_default=sa.false()))
    op.add_column('alquileres', sa.Column('motivo_sin_contrato', sa.Text(), nullable=True))

    # ── Conductor adicional: domicilio ────────────────────────────────────
    # La clausula 2.h exige nombre, documento Y direccion de cada conductor
    # adicional para que la autorizacion valga.
    op.add_column('conductores_adicionales', sa.Column('domicilio', sa.String(255), nullable=True))

    # ── Datos de la empresa en configuracion ──────────────────────────────
    for clave, valor, tipo, descripcion in CONFIG_EMPRESA:
        op.execute(sa.text("""
            INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion, updated_at)
            VALUES (:clave, :valor, :tipo, 'Empresa', :descripcion, NOW())
            ON CONFLICT (clave) DO NOTHING
        """).bindparams(clave=clave, valor=valor, tipo=tipo, descripcion=descripcion))


def downgrade() -> None:
    for clave, *_ in CONFIG_EMPRESA:
        op.execute(sa.text("DELETE FROM configuracion WHERE clave = :c").bindparams(c=clave))

    op.drop_column('conductores_adicionales', 'domicilio')
    op.drop_column('alquileres', 'motivo_sin_contrato')
    op.drop_column('alquileres', 'entregado_sin_contrato')

    op.execute("ALTER TABLE contratos ALTER COLUMN numero DROP DEFAULT")
    op.execute("DROP SEQUENCE IF EXISTS contratos_numero_seq")
    op.drop_index('ix_contratos_alquiler_id', table_name='contratos')
    op.create_index('ix_contratos_alquiler_id', 'contratos', ['alquiler_id'], unique=True)

    for col in ('creado_por', 'activo', 'motivo_anulacion', 'anulado', 'atendido_por',
                'firmado_por_dni', 'firmado_por_nombre', 'firma_key', 'firmado_at',
                'snapshot', 'plantilla_id', 'prefijo', 'numero'):
        op.drop_column('contratos', col)

    op.drop_table('contrato_plantillas')
