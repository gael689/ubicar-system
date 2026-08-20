"""Índices compuestos para los patrones de consulta que el sistema usa de verdad

Plan de escalabilidad §1.9. La tabla `reservas` tenía un solo índice compuesto
—`(vehiculo_id, fecha_inicio)`— y todo lo demás iba por índices de una columna,
que Postgres puede combinar pero mucho peor que un compuesto que cubra el
filtro entero.

Los cuatro que se agregan salen de mirar las consultas reales, no de adivinar:

1. **`reservas(vehiculo_id, fecha_fin)`** — `ReservaService._cargar_ventanas`
   filtra `vehiculo_id = X AND fecha_fin >= desde AND fecha_inicio <= hasta`.
   El índice que había cubre la mitad (`fecha_inicio`); esta es la otra mitad, y
   es la que más recorta: `fecha_fin >= desde` descarta toda la historia vieja
   del auto de una sola pasada.

2. **`reservas(estado, fecha_fin)`** — lo usan la sincronización de estados por
   reloj (`activa` → `vencida`) y varias reglas del motor de notificaciones,
   que preguntan por estado y fecha juntos. Corre cada 5 minutos.

3. **`reservas(fecha_inicio, fecha_fin)`** — el calendario
   (`find_para_ocupacion`) pide un rango de 120 días **sin filtrar por
   vehículo** cuando se miran todos. Sin este índice eso es un seq scan sobre
   la tabla más grande del sistema, en la pantalla de inicio.

4. **`gastos(vehiculo_id, fecha)`** — el reporte de flota agrega gastos por
   vehículo dentro de un período. Había un índice por cada columna suelta.

5. **`movimientos_cuenta_corriente(cuenta_corriente_id, fecha)`** — el libro
   mayor de un cliente se lee siempre así: su cuenta, ordenada por fecha.

**No se toca ninguna columna ni ningún dato.** Un `CREATE INDEX` es reversible
y no puede romper el código que esté corriendo: en el peor caso una consulta
sigue yendo por el plan viejo. Por eso esta migración es segura de aplicar con
el servidor arriba, que es como Railway la va a correr.

Revision ID: 076_indices_filtros
Revises: 075_retiro_recargo_edad
"""
from alembic import op

revision = "076_indices_filtros"
down_revision = "075_retiro_recargo_edad"
branch_labels = None
depends_on = None


# (nombre, tabla, columnas)
INDICES = [
    ("ix_reservas_vehiculo_fecha_fin", "reservas", ["vehiculo_id", "fecha_fin"]),
    ("ix_reservas_estado_fecha_fin", "reservas", ["estado", "fecha_fin"]),
    ("ix_reservas_rango", "reservas", ["fecha_inicio", "fecha_fin"]),
    ("ix_gastos_vehiculo_fecha", "gastos", ["vehiculo_id", "fecha"]),
    (
        "ix_movimientos_cc_cuenta_fecha",
        "movimientos_cuenta_corriente",
        ["cuenta_corriente_id", "fecha"],
    ),
]


def upgrade() -> None:
    for nombre, tabla, columnas in INDICES:
        op.create_index(nombre, tabla, columnas)


def downgrade() -> None:
    for nombre, tabla, _ in reversed(INDICES):
        op.drop_index(nombre, table_name=tabla)
