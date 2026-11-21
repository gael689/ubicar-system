import { ArrowRight, Clock, MessageCircle, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import { useDescartarNotificacion, usePosponerNotificacion } from '@/hooks/useNotificaciones';
import { antiguedad, enDias, iconoDeOportunidad, pesosRedondos } from '@/lib/notificaciones';
import { cn, extractError } from '@/lib/utils';
import type { NotificacionItem } from '@/types';

interface Props {
  item: NotificacionItem;
  onIr: (url: string) => void;
}

/**
 * Una oportunidad 💡: **cuánta plata hay en juego** bien grande, qué hacer, y
 * el WhatsApp ya escrito cuando hay a quién mandarle.
 *
 * Las dos salidas son explícitas y sin hover: "Recordarme en 7 días" (hoy no,
 * pero sí) y "No me sirve" (el motor la calla por semanas, ver
 * `REAVISO_DIAS_POR_TIPO` en el backend).
 */
export function OportunidadCard({ item, onIr }: Props) {
  const posponer = usePosponerNotificacion();
  const descartar = useDescartarNotificacion();
  const datos = item.datos ?? {};
  const Icono = iconoDeOportunidad(item.tipo);
  const impacto = typeof datos.impacto === 'number' && datos.impacto > 0 ? datos.impacto : null;
  const impactoTexto = datos.impacto_label || (impacto ? `≈ ${pesosRedondos(impacto)}` : null);
  // El pedido de reseñas es un solo aviso con la lista adentro: cada cliente
  // con su propio WhatsApp.
  const clientes = Array.isArray(datos.clientes) ? datos.clientes : [];

  async function hacer(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <article className={cn(
      'flex flex-col rounded-2xl border bg-card p-4',
      item.urgencia === 'media' ? 'border-amber-300' : 'border-border',
    )}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Icono className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{item.titulo}</h3>
            <span className="shrink-0 text-[10px] text-muted-foreground">{antiguedad(item.created_at)}</span>
          </div>
          {impactoTexto && (
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-700">{impactoTexto}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{item.descripcion}</p>
        </div>
      </div>

      {clientes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {clientes.map((c, i) => (
            <li key={c.cliente_id ?? i} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{c.nombre}</span>
              {c.whatsapp ? (
                <a
                  href={c.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">sin teléfono</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onIr(item.url_destino)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {item.accion || 'Ver'} <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {typeof datos.whatsapp === 'string' && datos.whatsapp && (
          <a
            href={datos.whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => hacer(() => posponer.mutateAsync({ id: item.id, hasta: enDias(7) }), 'Te la recordamos en 7 días')}
            disabled={posponer.isPending}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Clock className="h-3.5 w-3.5" /> Recordarme en 7 días
          </button>
          <button
            onClick={() => hacer(() => descartar.mutateAsync(item.id), 'Listo, no la mostramos más por un tiempo')}
            disabled={descartar.isPending}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-danger"
          >
            <ThumbsDown className="h-3.5 w-3.5" /> No me sirve
          </button>
        </div>
      </div>
    </article>
  );
}
