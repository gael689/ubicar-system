"""032_configuracion

Fase 3, ítem 40 del plan maestro: pantalla de Configuración.

No estaba detallado más allá del título ("gracia, multiplicadores,
umbrales, cargos fijos, políticas") — al revisar el sistema, el único
conjunto de constantes de negocio genuinamente hardcodeadas y tuneables es
el del control de 24hs (`domain/control_24hs.py`, D6): gracia_minutos,
multiplicador_hora y tope_horas_dia_extra. El resto de lo mencionado en el
título no existe como parámetro numérico hoy: la política de seña (D-11)
es binaria (se retiene entera, no hay porcentaje), y los umbrales de
notificaciones ya tienen su propio mecanismo de tuneo por usuario
(`preferencias_notificacion.anticipacion_dias`, Fase 2) — duplicarlos acá
sería una segunda fuente de verdad para lo mismo.

Tabla genérica clave/valor en vez de columnas fijas: permite agregar
nuevos parámetros configurables más adelante (cargos fijos, políticas)
sin otra migración. `tipo` es lo que el frontend usa para renderizar el
input correcto (number/decimal/bool/string).

No es un ledger — no aplica "nunca eliminar" con historial, es
configuración de aplicación (como `.env`), no un registro de negocio.

Revision ID: 032_configuracion
Revises: 031_vencimientos_vehiculo
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '032_configuracion'
down_revision = '031_vencimientos_vehiculo'
branch_labels = None
depends_on = None

SEED = [
    ("excedente.gracia_minutos", "40", "int", "control_24hs",
     "Minutos de gracia sin cargo después de la hora de devolución acordada (D6)"),
    ("excedente.multiplicador_hora", "3", "int", "control_24hs",
     "Multiplicador sobre la tarifa/hora para el cargo de excedente (D6): tarifa_hora × N"),
    ("excedente.tope_horas_dia_extra", "12", "int", "control_24hs",
     "A partir de cuántas horas de excedente se cobra un día completo en vez de por hora (D6)"),
]


def upgrade() -> None:
    op.create_table(
        'configuracion',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('clave', sa.String(80), nullable=False, unique=True, index=True),
        sa.Column('valor', sa.String(255), nullable=False),
        sa.Column('tipo', sa.String(20), nullable=False),
        sa.Column('categoria', sa.String(50), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=False),
        sa.Column('updated_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    conn = op.get_bind()
    for clave, valor, tipo, categoria, descripcion in SEED:
        conn.execute(
            sa.text(
                "INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion) "
                "VALUES (:clave, :valor, :tipo, :categoria, :descripcion)"
            ),
            {"clave": clave, "valor": valor, "tipo": tipo, "categoria": categoria, "descripcion": descripcion},
        )


def downgrade() -> None:
    op.drop_table('configuracion')
