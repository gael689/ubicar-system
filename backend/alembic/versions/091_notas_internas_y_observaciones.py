"""Las notas internas dejan de llegarle al cliente

**El bug, contado por quien lo sufrió.** El formulario de reserva tiene un campo
rotulado "Notas internas". Ahí se escribe *"al brasilero no se le entiende, que lo
atienda Franco"* o *"le cobramos de más porque es medio día"*. Y ese texto se
imprime tal cual en el PDF de confirmación, bajo el título "OBSERVACIONES"
(`services/reserva_pdf.py`), que además viaja **adjunto al mail de confirmación**
(`services/email_service.py::_pdf_reserva`). O sea: el campo prometía privacidad y
hacía exactamente lo contrario.

Y era peor de lo que se ve: `ReservaService.registrar_cobro` le **agrega** a ese
mismo campo una línea con la referencia interna del cobro
(`"Cobro 2026-08-20 — transferencia: <ref>"`), que también terminaba impresa.

**Por qué una columna nueva y no un renombre.** Los dos textos existen y son
distintos: uno es para el equipo y el otro para el cliente. Con un solo campo hay
que elegir a quién traicionar. `notas` se queda como está —interna, que es lo que
el rótulo siempre dijo— y `observaciones` nace para lo que sí se comparte.

**Sin backfill, y no es un olvido.** El sitio público nunca mandó `notas`: el
cuerpo que arma `web/components/reservar/Paso4Pago.tsx` no incluye la clave, y no
hay un solo `<textarea>` en todo el sitio. Así que todo lo que hay hoy en `notas`
lo escribió el mostrador creyendo que era interno — y sigue siéndolo. Mover ese
texto a `observaciones` sería publicar retroactivamente lo que nadie quiso
publicar, que es el bug al revés.

Revision ID: 091_notas_vs_observaciones
Revises: 090_cuotas_en_tres
"""
import sqlalchemy as sa
from alembic import op

revision = "091_notas_vs_observaciones"
down_revision = "090_cuotas_en_tres"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reservas",
        sa.Column("observaciones", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reservas", "observaciones")
