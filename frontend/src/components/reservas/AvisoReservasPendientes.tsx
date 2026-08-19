import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Globe } from 'lucide-react';
import { FilaReservaWeb, esperandoHace } from './FilaReservaWeb';
import { PanelResolverReserva } from './PanelResolverReserva';
import { useReservasPendientes } from '@/hooks/useReservasWeb';
import { cn } from '@/lib/utils';
import type { Reserva } from '@/types';

/**
 * El aviso de reservas sin resolver. **Vive en el layout, así que está en
 * todas las pantallas.**
 *
 * Antes esto vivía en dos lugares y los dos eran pasivos: la campana del
 * sidebar —que hay que acordarse de mirar— y un panel al pie del calendario,
 * colapsado por defecto y sólo en esa pantalla. Una reserva web pagada entra
 * **confirmada pero sin auto**, y una reserva sin auto no tiene fila donde
 * dibujarse en la grilla: era invisible salvo que alguien abriera ese panel.
 *
 * **No interrumpe y no se puede descartar.** Las dos cosas son a propósito y
 * están en tensión:
 *
 * - Un modal que salta encima de alguien que está en medio de un check-in
 *   hace que se aprenda a cerrarlo sin leerlo. Por eso es una barra, no una
 *   ventana.
 * - Pero un aviso que se puede posponer es un aviso que se pospone. Como no
 *   hay botón de "después", la única forma de que desaparezca es resolver la
 *   reserva — que es exactamente lo que se quiere que pase.
 *
 * Colapsado muestra **cuál** es la más urgente, no sólo cuántas hay: "2
 * reservas" no mueve a nadie, "Gael González, sale el 3 de septiembre" sí.
 */
export function AvisoReservasPendientes() {
  const { data } = useReservasPendientes();
  const [abierto, setAbierto] = useState(false);
  const [resolviendo, setResolviendo] = useState<Reserva | null>(null);

  const reservas = data ?? [];
  if (reservas.length === 0) return null;

  // El backend ya las ordena por urgencia y después por antigüedad, así que la
  // primera es la que hay que mostrar colapsada. No se reordena acá: dos
  // criterios de urgencia en dos lados terminan contradiciéndose.
  const primera = reservas[0];
  const critica = reservas.some(r => r.estado === 'revision_sin_cupo');
  const espera = esperandoHace(primera.created_at);

  return (
    <>
      <div
        className={cn(
          'shrink-0 border-t bg-card',
          // La barra vive arriba de la nav de mobile, que es `fixed`.
          'mb-16 md:mb-0',
          critica ? 'border-danger' : 'border-border',
        )}
      >
        <button
          onClick={() => setAbierto(v => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
        >
          <span className="flex min-w-0 items-center gap-2">
            {critica
              ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
              : <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />}

            <span className="font-medium text-foreground">
              {critica ? 'Pagaron y no hay auto' : 'Reservas sin resolver'}
            </span>

            <span
              className={cn(
                'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold text-white',
                critica ? 'bg-danger' : 'bg-warning',
              )}
            >
              {reservas.length}
            </span>

            {/* Cuál es, no sólo cuántas. */}
            {!abierto && (
              <span className="truncate text-xs text-muted-foreground">
                {primera.web_contacto_nombre || primera.cliente?.nombre_completo || `#${primera.id}`}
                {!primera.vehiculo_id && ' · sin auto'}
                {espera && ` · ${espera}`}
              </span>
            )}
          </span>

          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {abierto ? 'Ocultar' : 'Ver'}
            {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </span>
        </button>

        {abierto && (
          <div className="max-h-72 space-y-3 overflow-y-auto border-t border-border p-4">
            {reservas.map(r => (
              <FilaReservaWeb key={r.id} reserva={r} onResolver={() => setResolviendo(r)} />
            ))}
          </div>
        )}
      </div>

      {resolviendo && (
        <PanelResolverReserva
          reserva={resolviendo}
          onClose={() => setResolviendo(null)}
        />
      )}
    </>
  );
}
