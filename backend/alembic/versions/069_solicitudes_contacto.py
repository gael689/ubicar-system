"""069 - Solicitudes de contacto: "que me llamen ustedes" (D-61)

La segunda salida del panel de derivacion. Hasta ahora ese camino era
`/public/solicitudes`, que **crea una fila en `reservas`** con estado
`sin_disponibilidad` -- por eso el mostrador no podia distinguir un pedido de
llamada de una reserva de verdad: era una reserva.

Tabla propia y no un estado mas en `reservas`, por cuatro razones concretas:

1. Una solicitud fuera de ventana **no tiene categoria** (todavia no eligio
   auto), y `/public/solicitudes` la exige. Con un estado habria que inventar
   una categoria falsa.
2. `reservas` obliga a `cliente_id`, `usuario_id`, `lugar_entrega` y
   `lugar_devolucion`. Hoy eso se paga con el cliente generico "Consultas web"
   y con un **503 si ese cliente no existe** -- o sea, la solicitud se pierde
   justo cuando la base esta recien reseteada. Esta tabla no depende de nadie.
3. Cada estado nuevo en `reservas` obliga a acordarse de excluirlo en
   `ESTADOS_QUE_OCUPAN`, en `contrato_estado` y en el listado general. El que
   se olvida es un bug silencioso.
4. Hace falta un `motivo` (por que cayo aca), y un `estado` no puede llevarlo
   sin inventar tres estados y un ALTER TYPE sobre el enum de Postgres.

Seedea ademas los datos de contacto en `configuracion`: estaban escritos a
mano en seis archivos del front, incluido el propio cartel de derivacion.

Revision ID: 069_solicitudes_contacto
Revises: 068_busquedas_sin_resultado
"""
import sqlalchemy as sa
from alembic import op

revision = "069_solicitudes_contacto"
down_revision = "068_busquedas_sin_resultado"
branch_labels = None
depends_on = None

CONTACTO = [
    (
        "contacto.whatsapp",
        "5492914180554",
        "WhatsApp principal de Ubicar, solo digitos con codigo de pais (D-61). "
        "Es el que arma los links wa.me de la web.",
    ),
    (
        "contacto.whatsapp_display",
        "+54 9 291 418-0554",
        "El mismo WhatsApp, como lo lee una persona. Separado del anterior "
        "para que nadie meta espacios adentro de un link y lo rompa.",
    ),
    (
        "contacto.telefono",
        "+5492923474791",
        "Telefono de contacto que muestra la web en el panel de derivacion.",
    ),
    (
        "contacto.email",
        "ubicar.rent@gmail.com",
        "Mail de contacto que muestra la web en el panel de derivacion.",
    ),
]


def upgrade() -> None:
    op.create_table(
        "solicitudes_contacto",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        # fuera_de_ventana | sin_cupo | otro_lugar
        sa.Column("motivo", sa.String(30), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("telefono", sa.String(30), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("categoria_id", sa.Integer(), sa.ForeignKey("categorias.id"), nullable=True),
        sa.Column("fecha_inicio", sa.Date(), nullable=True),
        sa.Column("fecha_fin", sa.Date(), nullable=True),
        sa.Column("hora_inicio", sa.Time(), nullable=True),
        sa.Column("hora_fin", sa.Time(), nullable=True),
        sa.Column("lugar_retiro", sa.String(255), nullable=True),
        sa.Column("lugar_devolucion", sa.String(255), nullable=True),
        # Lo que la persona tipeo en "Otro lugar". Va aparte y NUNCA se copia a
        # `reservas.lugar_entrega`: eso es justo lo que D-56 tuvo que sacar.
        sa.Column("lugar_texto_libre", sa.String(255), nullable=True),
        sa.Column("edad_declarada", sa.Integer(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        # pendiente | contactado | cerrado
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("resuelta_por", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("resuelta_en", sa.DateTime(), nullable=True),
        sa.Column("resultado", sa.Text(), nullable=True),
    )
    op.create_index("ix_solicitudes_contacto_created_at", "solicitudes_contacto", ["created_at"])
    op.create_index("ix_solicitudes_contacto_motivo", "solicitudes_contacto", ["motivo"])
    op.create_index("ix_solicitudes_contacto_estado", "solicitudes_contacto", ["estado"])
    op.create_index("ix_solicitudes_contacto_categoria_id", "solicitudes_contacto", ["categoria_id"])

    for clave, valor, descripcion in CONTACTO:
        op.get_bind().execute(
            sa.text("""
                INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
                VALUES (:clave, :valor, 'string', 'Contacto', :descripcion)
                ON CONFLICT (clave) DO NOTHING
            """),
            {"clave": clave, "valor": valor, "descripcion": descripcion},
        )


def downgrade() -> None:
    for clave, _valor, _descripcion in CONTACTO:
        op.get_bind().execute(
            sa.text("DELETE FROM configuracion WHERE clave = :clave"), {"clave": clave}
        )
    op.drop_table("solicitudes_contacto")
