"""061 - Ventana de rotacion: el auto que vuelve ese mismo dia

Cuanto tarda el equipo en dejar un auto listo para volver a salir, en horas.

Cuando no queda ninguna unidad libre de la categoria pero una **se devuelve ese
mismo dia**, la web deja de decir "sin disponibilidad" y ofrece la entrega mas
tarde: se devuelve 10:00, se prepara, se entrega 12:00. Sin esto, el caso mas
comun de una flota chica —una sola unidad por categoria, que rota— se pierde
como si el auto no existiera.

Va en `configuracion` y no como constante del codigo porque **es un dato
operativo que solo conoce el mostrador**: si limpiar y revisar lleva tres horas
en temporada, el margen se sube desde el sistema y no con un deploy. Y si se
pone en 0, la rotacion se ofrece sin margen; para apagarla del todo se usa un
numero mas grande que cualquier jornada.

Es idempotente: no pisa ningun valor ya cargado.

Revision ID: 061_ventana_rotacion
Revises: 060_emails_enviados
"""
import sqlalchemy as sa
from alembic import op

revision = "061_ventana_rotacion"
down_revision = "060_emails_enviados"
branch_labels = None
depends_on = None


CLAVE = "disponibilidad.margen_rotacion_horas"
VALOR = "2"
DESCRIPCION = (
    "Horas que se toma el equipo para preparar un auto que vuelve, antes de "
    "volver a entregarlo. Solo se usa cuando no queda ninguna unidad libre de "
    "la categoria y una se devuelve ese mismo dia: la web ofrece la entrega "
    "corrida (devuelven 10:00 + 2 h = entrega 12:00) en vez de mostrar 'sin "
    "disponibilidad'."
)


def upgrade() -> None:
    op.get_bind().execute(
        sa.text("""
            INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion)
            VALUES (:clave, :valor, 'int', 'Reservas web', :descripcion)
            ON CONFLICT (clave) DO NOTHING
        """),
        {"clave": CLAVE, "valor": VALOR, "descripcion": DESCRIPCION},
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM configuracion WHERE clave = :clave"), {"clave": CLAVE}
    )
