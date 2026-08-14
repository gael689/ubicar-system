import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FilaReservaWeb, esperandoHace } from './FilaReservaWeb';
import { PanelResolverReserva } from './PanelResolverReserva';
import type { Reserva } from '@/types';

/**
 * "Pendiente de asignación" — plan de conexión (13/08), 2.2. Cierra C-1/C-7:
 * una reserva sin auto asignado no tiene fila en el calendario donde
 * dibujarse, así que vive acá, con la ficha completa del pedido y del
 * cliente, sin tener que cambiar de pantalla para resolverla.
 *
 * **Enmienda D-24 (D-58), a propósito y con cuidado de no contradecirla del
 * todo:** con cero pendientes esto no renderiza nada — la home sigue siendo
 * el calendario y nada más, que es justo lo que D-24 pedía. El scroll queda
 * contenido acá adentro (`max-h-64 overflow-y-auto`), nunca en la página.
 */
export function PanelPendienteAsignacion({
  reservas, onCambio,
}: { reservas: Reserva[]; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [resolviendo, setResolviendo] = useState<Reserva | null>(null);

  if (reservas.length === 0) return null;

  const masVieja = reservas.reduce((a, b) => (a.created_at < b.created_at ? a : b));
  const espera = esperandoHace(masVieja.created_at);

  return (
    <div className="shrink-0 border-t border-border bg-card">
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          {abierto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          Pendiente de asignación
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-warning px-1.5 py-0.5 text-xs font-bold text-white">
            {reservas.length}
          </span>
        </span>
        {!abierto && espera && (
          <span className="text-xs text-muted-foreground">la más vieja espera {espera}</span>
        )}
      </button>

      {abierto && (
        <div className="max-h-64 space-y-3 overflow-y-auto border-t border-border p-4">
          {reservas.map(r => (
            <FilaReservaWeb key={r.id} reserva={r} onResolver={() => setResolviendo(r)} />
          ))}
        </div>
      )}

      {resolviendo && (
        <PanelResolverReserva
          reserva={resolviendo}
          onClose={() => { setResolviendo(null); onCambio(); }}
          onCambio={onCambio}
        />
      )}
    </div>
  );
}
