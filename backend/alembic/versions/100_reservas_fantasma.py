"""Reservas fantasma: una reserva sin check-out vuelve a estar confirmada

Hasta el 27/09/2026 el reloj (`ReservaService.sincronizar_estados_por_horario`)
pasaba a `activa` toda reserva confirmada apenas llegaba la hora de retiro,
aunque el auto no hubiera salido. Esas reservas bloqueaban el calendario como
si el auto estuviera en la calle y apagaban el aviso de check-out pendiente.
El reloj ya no lo hace; esta migración deshace lo que quedó.

**Qué toca:** reservas `activa` o `vencida` **sin alquiler** cuya devolución
todavía no pasó (`fecha_fin >= hoy`, hora argentina) → `confirmada`. Así
vuelven a pedir el check-out y el aviso `checkout_pendiente` las reclama.

**Qué no toca:** las que ya terminaron (`fecha_fin < hoy`). Pasarlas a
confirmada sólo llenaría la campana de avisos de entregas que nunca van a
pasar; a esas las cancela —no las borra— el script
`scripts/limpiar_reservas_sin_contrato.py`, que además separa las que tienen
plata asociada. Ningún cambio de datos más allá del estado.

Es idempotente: una segunda corrida no encuentra nada.

Revision ID: 100_reservas_fantasma
Revises: 096_pagare_franquicia
"""
from alembic import op

revision = "100_reservas_fantasma"
down_revision = "096_pagare_franquicia"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE reservas SET estado = 'confirmada'
        WHERE estado IN ('activa', 'vencida')
          AND fecha_fin >= (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND NOT EXISTS (SELECT 1 FROM alquileres a WHERE a.reserva_id = reservas.id)
        """
    )


def downgrade() -> None:
    # No hay vuelta atrás que tenga sentido: no quedó registro de cuáles se
    # cambiaron, y volver a marcarlas `activa` sería volver a fabricar el
    # fantasma. El reloj viejo, si se restaurara, las movería solo.
    pass
