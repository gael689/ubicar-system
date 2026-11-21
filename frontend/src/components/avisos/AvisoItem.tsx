import { ArrowRight, Check, Clock, MoreHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDescartarNotificacion, useMarcarLeida, usePosponerNotificacion,
} from '@/hooks/useNotificaciones';
import { antiguedad, enDias, URGENCIA_PUNTO } from '@/lib/notificaciones';
import { cn, extractError } from '@/lib/utils';
import type { NotificacionItem } from '@/types';

interface Props {
  item: NotificacionItem;
  /** Ir al lugar donde se resuelve. Lo recibe de afuera porque la campana
   *  además tiene que cerrarse. */
  onIr: (url: string) => void;
  /** En la campana hay poco ancho; en la página, más aire. */
  compacto?: boolean;
}

/**
 * Un aviso: qué pasa, hace cuánto, y **un botón que dice qué hacer**.
 *
 * Antes el aviso entero era un link y "leída / posponer / descartar" aparecían
 * sólo al pasar el mouse: en el celular no hay mouse, así que no existían.
 * Ahora la acción principal es un botón con nombre ("Entregar el auto") y el
 * resto está siempre a mano: el tilde para leer y el menú "⋯".
 */
export function AvisoItem({ item, onIr, compacto = false }: Props) {
  const marcarLeida = useMarcarLeida();
  const posponer = usePosponerNotificacion();
  const descartar = useDescartarNotificacion();

  async function hacer(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className={cn(
      'rounded-xl border border-border bg-card',
      compacto ? 'px-3 py-2.5' : 'px-4 py-3',
    )}>
      <div className="flex items-start gap-2.5">
        <span
          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', URGENCIA_PUNTO[item.urgencia] ?? 'bg-slate-300')}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn('truncate font-semibold text-foreground', compacto ? 'text-xs' : 'text-sm')}>
              {item.titulo}
            </p>
            <span className="shrink-0 text-[10px] text-muted-foreground">{antiguedad(item.created_at)}</span>
          </div>
          <p className={cn('mt-0.5 truncate text-muted-foreground', compacto ? 'text-[11px]' : 'text-xs')} title={item.descripcion}>
            {item.descripcion}
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={() => onIr(item.url_destino)}
              className="inline-flex min-w-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <span className="truncate">{item.accion || 'Ver'}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </button>

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => hacer(() => marcarLeida.mutateAsync(item.id))}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-success"
                title="Marcar como leída"
                aria-label={`Marcar como leída: ${item.titulo}`}
              >
                <Check className="h-4 w-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Más opciones"
                    aria-label={`Más opciones: ${item.titulo}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[60]">
                  {[3, 7].map(n => (
                    <DropdownMenuItem
                      key={n}
                      onSelect={() => hacer(() => posponer.mutateAsync({ id: item.id, hasta: enDias(n) }))}
                    >
                      <Clock className="mr-2 h-3.5 w-3.5" /> Recordarme en {n} días
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    destructive
                    onSelect={() => hacer(() => descartar.mutateAsync(item.id))}
                  >
                    <X className="mr-2 h-3.5 w-3.5" /> Descartar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
