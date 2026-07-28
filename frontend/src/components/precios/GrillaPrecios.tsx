import { useMemo } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import type { CalendarioPrecios, DiaCalendarioPrecio } from '@/types';

const DIA_LETRA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/**
 * Grilla de precios: categorías en filas, días del mes en columnas.
 *
 * Tiene que leerse como un Excel — es la pantalla que los dueños van a mirar
 * todas las semanas para decidir precios. Por eso muestra el precio ya
 * resuelto de cada día (el que realmente se va a cobrar) y no las reglas
 * crudas: quien mira quiere saber "cuánto sale el 24 de diciembre", no
 * deducirlo de tres reglas superpuestas.
 *
 * Los tres estados de una celda se distinguen a simple vista:
 * - **promo** (sólido, ámbar): hay una promoción ese día.
 * - **calendario**: precio cargado a mano para esa fecha.
 * - **banda** (atenuado): no hay regla, cae a la tarifa por duración de
 *   siempre. No es un error, pero avisa que la fecha no está planificada.
 * - **sin precio** (rojo): ni regla ni tarifa. Acá sí falta cargar algo.
 */
export function GrillaPrecios({
  data,
  onCeldaClick,
}: {
  data: CalendarioPrecios;
  onCeldaClick?: (categoriaId: number, fecha: string) => void;
}) {
  const fechas = useMemo(
    () => data.filas[0]?.dias.map(d => d.fecha) ?? [],
    [data.filas]
  );

  if (fechas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No hay categorías activas para mostrar.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background text-left font-semibold text-muted-foreground px-2 py-2 min-w-[9rem]">
              Categoría
            </th>
            {fechas.map(f => {
              const d = new Date(`${f}T12:00:00`);
              const finde = d.getDay() === 0 || d.getDay() === 6;
              return (
                <th
                  key={f}
                  className={cn(
                    'px-1 py-2 text-center font-medium min-w-[3.5rem]',
                    finde ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  <div className="text-[10px]">{DIA_LETRA[d.getDay()]}</div>
                  <div className={cn('text-sm', finde && 'font-bold')}>{d.getDate()}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.filas.map(fila => (
            <tr key={fila.categoria_id}>
              <td className="sticky left-0 z-10 bg-background px-2 py-1 font-medium text-foreground whitespace-nowrap">
                {fila.categoria_nombre}
              </td>
              {fila.dias.map(dia => (
                <Celda
                  key={dia.fecha}
                  dia={dia}
                  onClick={
                    onCeldaClick
                      ? () => onCeldaClick(fila.categoria_id, dia.fecha)
                      : undefined
                  }
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Celda({ dia, onClick }: { dia: DiaCalendarioPrecio; onClick?: () => void }) {
  const titulo = dia.precio
    ? `${formatCurrency(dia.precio)} — ${dia.regla_nombre ?? ''}${dia.etiqueta_promo ? ` · ${dia.etiqueta_promo}` : ''}`
    : 'Sin precio configurado para este día';

  return (
    <td className="p-0.5">
      <button
        type="button"
        onClick={onClick}
        title={titulo}
        disabled={!onClick}
        className={cn(
          'w-full rounded px-1 py-1.5 text-center tabular-nums transition-colors',
          onClick && 'hover:ring-1 hover:ring-primary cursor-pointer',
          dia.origen === 'sin_precio' && 'bg-danger text-white font-semibold',
          dia.origen === 'banda' && 'bg-muted text-muted-foreground',
          dia.origen === 'calendario' && !dia.es_promocional && 'bg-primary/15 text-primary font-semibold',
          dia.origen === 'calendario' && dia.es_promocional && 'bg-amber-500 text-white font-bold',
        )}
      >
        {dia.precio ? abreviar(dia.precio) : '—'}
      </button>
    </td>
  );
}

/** $150.000 → "150k". En una grilla de 31 columnas el número completo no entra. */
function abreviar(precio: string): string {
  const n = Number(precio);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
