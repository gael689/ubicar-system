"""036_fechas_especiales

Fechas con relevancia comercial (feriados, Navidad, Dia del Amigo, temporada
alta). Cumple dos funciones, en este orden:

1. HOY: que el administrador las vea en el calendario de ocupacion. Saber que
   la semana que viene es Navidad cambia como se planifica la flota, y hoy esa
   informacion no esta en ningun lado del sistema.
2. DESPUES (Fase 5, item 57): son el ancla de las reglas de
   `tarifas_calendario` — una regla de precio va a poder apuntar a una fecha
   especial en vez de repetir el rango a mano.

Se siembran los feriados nacionales argentinos 2026 y 2027 con fecha fija, mas
las fechas comerciales que mueven alquileres. NO se siembran los feriados
moviles (Carnaval, Semana Santa, y los trasladables por decreto) porque
dependen del calendario liturgico o de una decision anual del PEN: sembrarlos
"calculados" seria adivinar. Se cargan a mano desde la pantalla, que para eso
existe.

Revision ID: 036_fechas_especiales
Revises: 035_danios_vehiculo
Create Date: 2026-07-27
"""
from datetime import date

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '036_fechas_especiales'
down_revision = '035_danios_vehiculo'
branch_labels = None
depends_on = None


tipo_fecha_especial = sa.Enum(
    'feriado', 'fin_semana_largo', 'comercial', 'temporada', 'otro',
    name='tipo_fecha_especial',
)
color_fecha_especial = sa.Enum(
    'rojo', 'ambar', 'verde', 'azul', 'violeta',
    name='color_fecha_especial',
)


# (nombre, mes, dia, tipo, color) — se expande a 2026 y 2027.
FIJAS = [
    ("Ano Nuevo",                                  1,  1, 'feriado',   'rojo'),
    ("Dia de la Memoria",                          3, 24, 'feriado',   'rojo'),
    ("Dia del Veterano y Caidos en Malvinas",      4,  2, 'feriado',   'rojo'),
    ("Dia del Trabajador",                         5,  1, 'feriado',   'rojo'),
    ("Dia de la Revolucion de Mayo",               5, 25, 'feriado',   'rojo'),
    ("Dia de la Independencia",                    7,  9, 'feriado',   'rojo'),
    ("Dia del Amigo",                              7, 20, 'comercial', 'violeta'),
    ("Navidad",                                   12, 25, 'feriado',   'verde'),
    ("Inmaculada Concepcion",                     12,  8, 'feriado',   'rojo'),
]


def upgrade() -> None:
    bind = op.get_bind()
    tipo_fecha_especial.create(bind, checkfirst=True)
    color_fecha_especial.create(bind, checkfirst=True)

    tabla = op.create_table(
        'fechas_especiales',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('nombre', sa.String(120), nullable=False),
        sa.Column('fecha_desde', sa.Date(), nullable=False),
        sa.Column('fecha_hasta', sa.Date(), nullable=False),
        sa.Column('tipo', postgresql.ENUM(name='tipo_fecha_especial', create_type=False),
                  nullable=False, server_default='otro'),
        sa.Column('color', postgresql.ENUM(name='color_fecha_especial', create_type=False),
                  nullable=False, server_default='ambar'),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('creado_por', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_fechas_especiales_fecha_desde', 'fechas_especiales', ['fecha_desde'])
    op.create_index('ix_fechas_especiales_fecha_hasta', 'fechas_especiales', ['fecha_hasta'])

    filas = []
    for anio in (2026, 2027):
        for nombre, mes, dia, tipo, color in FIJAS:
            fecha = date(anio, mes, dia)
            filas.append({
                'nombre': f"{nombre} {anio}",
                'fecha_desde': fecha,
                'fecha_hasta': fecha,
                'tipo': tipo,
                'color': color,
                'activo': True,
            })
        # Las fiestas mueven alquileres toda la semana, no solo el dia.
        filas.append({
            'nombre': f"Fiestas {anio}/{anio + 1}",
            'fecha_desde': date(anio, 12, 20),
            'fecha_hasta': date(anio + 1, 1, 6),
            'tipo': 'temporada',
            'color': 'verde',
            'activo': True,
        })
        filas.append({
            'nombre': f"Temporada alta verano {anio}",
            'fecha_desde': date(anio, 1, 1),
            'fecha_hasta': date(anio, 2, 28),
            'tipo': 'temporada',
            'color': 'azul',
            'activo': True,
        })

    op.bulk_insert(tabla, filas)


def downgrade() -> None:
    op.drop_index('ix_fechas_especiales_fecha_hasta', table_name='fechas_especiales')
    op.drop_index('ix_fechas_especiales_fecha_desde', table_name='fechas_especiales')
    op.drop_table('fechas_especiales')

    bind = op.get_bind()
    color_fecha_especial.drop(bind, checkfirst=True)
    tipo_fecha_especial.drop(bind, checkfirst=True)
