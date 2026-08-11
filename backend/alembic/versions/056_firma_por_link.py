"""Firma del contrato por link, y el escaneo del firmado en papel (D-C6)

Hasta ahora el contrato se firmaba de una sola forma: el cliente parado en el
mostrador, trazando la firma en la pantalla. Eso obliga a resolver el papel en
el peor momento —con el auto en la puerta y alguien esperando— y no deja
ninguna via para el cliente que reserva por la web y aparece a retirar.

Quedan **tres caminos**, y los tres terminan en la misma fila de `contratos`:

1. **Link** (el principal). Se emite el contrato, se genera un link con
   vencimiento y se le manda al cliente. El lee el anverso y las trece
   clausulas, tilda las aceptaciones, firma con el dedo y listo. Llega el aviso
   con el PDF firmado.
2. **Papel**. Se imprime, se firma con lapicera, se marca firmado en el sistema
   y **se adjunta el escaneo o la foto** — que es lo que faltaba: marcarlo se
   podia, pero el original quedaba solo en una carpeta.
3. **Mostrador** (el que ya existia). Firma en pantalla, en el acto.

Columnas nuevas:

- `firma_token` — lo unico que viaja en la URL. Es un secreto: quien lo tiene
  puede leer el contrato y firmarlo, asi que va indexado, unico, y se revoca
  poniendolo en NULL.
- `firma_token_expira` — un link de firma que no vence es un contrato que
  cualquiera puede firmar dentro de dos anios.
- `firma_aceptaciones` — **el texto que el cliente acepto, no solo un booleano**.
  Guardar `acepto_terminos = true` no prueba nada el dia que los terminos
  cambien: lo que hace oponible la aceptacion es haber congelado que decia en
  ese momento, igual que el snapshot congela el anverso.
- `firma_ip` / `firma_user_agent` — el rastro de la firma remota. Es lo que
  distingue una firma trazada por el cliente de una que cargo un operador.
- `escaneo_key` — el PDF o la foto del ejemplar firmado en papel.

Se reusan `link_prellenado` (la URL completa, para volver a copiarla sin
regenerar el token) y se deja de lado `link_expiracion`, que nunca se escribio.

Revision ID: 056_firma_por_link
Revises: 055_locador_finar
"""
from alembic import op
import sqlalchemy as sa


revision = "056_firma_por_link"
down_revision = "055_locador_finar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contratos", sa.Column("firma_token", sa.String(64), nullable=True))
    op.create_index(
        "ix_contratos_firma_token", "contratos", ["firma_token"], unique=True
    )
    op.add_column("contratos", sa.Column("firma_token_expira", sa.DateTime(), nullable=True))
    op.add_column("contratos", sa.Column("firma_aceptaciones", sa.JSON(), nullable=True))
    op.add_column("contratos", sa.Column("firma_ip", sa.String(45), nullable=True))
    op.add_column("contratos", sa.Column("firma_user_agent", sa.String(255), nullable=True))
    op.add_column("contratos", sa.Column("escaneo_key", sa.String(512), nullable=True))

    # Cuanto vive un link de firma. Tres dias: suficiente para que alguien lo
    # abra el fin de semana, corto para que un link olvidado en un WhatsApp no
    # siga siendo firmable un mes despues.
    op.execute(sa.text("""
        INSERT INTO configuracion (clave, valor, tipo, categoria, descripcion, updated_at)
        VALUES ('contrato.link_firma_horas', '72', 'int', 'Contratos',
                'Cuantas horas vive el link de firma que se le manda al cliente',
                NOW())
        ON CONFLICT (clave) DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM configuracion WHERE clave = 'contrato.link_firma_horas'"))
    op.drop_column("contratos", "escaneo_key")
    op.drop_column("contratos", "firma_user_agent")
    op.drop_column("contratos", "firma_ip")
    op.drop_column("contratos", "firma_aceptaciones")
    op.drop_column("contratos", "firma_token_expira")
    op.drop_index("ix_contratos_firma_token", table_name="contratos")
    op.drop_column("contratos", "firma_token")
