import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useDaniosPreexistentes } from '@/hooks/useDanios';
import { SEVERIDAD_DANIO_LABEL, SEVERIDAD_DANIO_COLOR, TIPO_DANIO_LABEL } from '@/lib/constants';
import { resolveAssetUrl } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { Danio } from '@/types';

interface Props {
  vehiculoId: number | undefined;
  /**
   * Daños que no van en esta lista aunque sigan vigentes.
   *
   * **Sin esto, un daño recién cargado en la devolución aparecía acá arriba
   * con el cartel "no son responsabilidad de este cliente"** —porque ya es un
   * daño vigente del auto— al mismo tiempo que abajo, en "Daños al devolver".
   * La misma chapa, dos veredictos opuestos en la misma pantalla.
   */
  excluir?: (d: Danio) => boolean;
}

/**
 * Daños que el vehículo ya traía. Se muestra al entregarlo para que el
 * operador sepa qué NO es responsabilidad del cliente que se lo lleva —
 * es informativo, no bloquea nada.
 */
export function DaniosPreexistentes({ vehiculoId, excluir }: Props) {
  const { data: todos = [], isLoading } = useDaniosPreexistentes(vehiculoId);
  const danios = excluir ? todos.filter(d => !excluir(d)) : todos;

  if (isLoading || !vehiculoId) return null;

  if (danios.length === 0) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-xs text-emerald-800">
          El vehículo no tiene daños registrados previos.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-warning border border-warning p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-white shrink-0" />
        <p className="text-xs font-bold text-white">
          El vehículo ya tiene {danios.length} daño{danios.length !== 1 ? 's' : ''} registrado{danios.length !== 1 ? 's' : ''} — no son responsabilidad de este cliente
        </p>
      </div>
      <div className="space-y-1.5">
        {danios.map(d => (
          <div key={d.id} className="rounded-lg bg-white/95 px-2.5 py-2 flex items-start gap-2">
            {d.fotos[0]?.url && (
              <a href={resolveAssetUrl(d.fotos[0].url) ?? '#'} target="_blank" rel="noreferrer" className="shrink-0">
                <img
                  src={resolveAssetUrl(d.fotos[0].url) ?? ''}
                  alt={d.zona}
                  className="h-10 w-10 object-cover rounded border border-border"
                />
              </a>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-foreground">{d.zona}</span>
                <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold', SEVERIDAD_DANIO_COLOR[d.severidad])}>
                  {SEVERIDAD_DANIO_LABEL[d.severidad]}
                </span>
                <span className="text-[10px] text-muted-foreground">{TIPO_DANIO_LABEL[d.tipo]}</span>
              </div>
              {d.descripcion && <p className="text-[11px] text-muted-foreground truncate">{d.descripcion}</p>}
              <p className="text-[10px] text-muted-foreground">
                Desde {formatDate(d.fecha_deteccion)}
                {d.fotos.length > 1 && ` · ${d.fotos.length} fotos`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
