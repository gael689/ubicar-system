"""Casilla a la que se avisa una reserva web, editable sin deploy (D-32b)

El aviso instantaneo de una reserva pagada tiene que llegarle a alguien. La
pregunta "a que casilla" es la decision D-32b, que sigue abierta con los
duenos — pero **no hace falta esperarla para programar**: la respuesta es un
dato, no una rama de codigo.

Va a `configuracion` y no a una variable de entorno por la misma razon que
`web.hold_minutos` en la migracion 048: si vive en el `.env`, cambiar la
casilla exige un deploy, y quien la quiere cambiar es un dueno que no tiene
como hacerlo. Ademas es lo primero que van a querer tocar cuando alguien deje
la empresa o cambien de correo.

**Se siembra vacia a proposito.** Vacia, `email_reservas.destinatarios_equipo`
cae a los destinatarios del digest matutino: es mejor que llegue al mismo
lugar que el resumen de las 08:00 a que no llegue a ningun lado. Sembrarla con
una direccion inventada seria peor: pareceria configurada y no lo estaria.

Revision ID: 052_email_aviso_reserva_web
Revises: 051_pagos_web
"""
from alembic import op
import sqlalchemy as sa


revision = "052_email_aviso_reserva_web"
down_revision = "051_pagos_web"
branch_labels = None
depends_on = None


CLAVE = "web.emails_aviso_reserva"


def upgrade() -> None:
    conf = sa.table(
        "configuracion",
        sa.column("clave", sa.String),
        sa.column("valor", sa.String),
        sa.column("tipo", sa.String),
        sa.column("categoria", sa.String),
        sa.column("descripcion", sa.String),
    )
    conn = op.get_bind()
    existe = conn.execute(
        sa.text("SELECT 1 FROM configuracion WHERE clave = :c"), {"c": CLAVE}
    ).first()
    if existe:
        return
    op.bulk_insert(conf, [{
        "clave": CLAVE,
        "valor": "",
        "tipo": "string",
        "categoria": "Reservas web",
        "descripcion": (
            "Direcciones de correo a las que se avisa, en el momento, cuando "
            "entra una reserva pagada desde la web. Separadas por coma. Si "
            "queda vacio se usan los destinatarios del resumen matutino."
        ),
    }])


def downgrade() -> None:
    op.get_bind().execute(sa.text("DELETE FROM configuracion WHERE clave = :c"), {"c": CLAVE})
