import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, ChevronRight, RefreshCw, Check, Clock, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificaciones,
  useGenerarNotificaciones,
  useMarcarLeida,
  usePosponerNotificacion,
  useDescartarNotificacion,
} from '@/hooks/useNotificaciones';
import { extractError } from '@/lib/utils';
import type { NotificacionItem, UrgenciaNot } from '@/types';
import { grupoDe } from '@/lib/notificaciones';

const URGENCIA_CONFIG: Record<UrgenciaNot, { dot: string }> = {
  critica: { dot: 'bg-red-600' },
  alta: { dot: 'bg-red-500' },
  media: { dot: 'bg-amber-500' },
  baja: { dot: 'bg-slate-400' },
};


export function NotificacionesPanel() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isFetching } = useNotificaciones();
  const generar = useGenerarNotificaciones();
  const navigate = useNavigate();

  const total = data?.total ?? 0;
  const criticas = data?.criticas ?? 0;
  const urgentes = data?.urgentes ?? 0;
  const items = data?.items ?? [];

  const grupos = items.reduce<Record<string, NotificacionItem[]>>((acc, item) => {
    const grupo = grupoDe(item.tipo);
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(item);
    return acc;
  }, {});

  function handleNavigate(url: string) {
    navigate(url);
    setOpen(false);
  }

  async function handleActualizar() {
    try {
      await generar.mutateAsync();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
        title="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${
            criticas > 0 ? 'bg-red-600 text-white' : urgentes > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-12 bottom-0 z-50 w-96 max-h-[80vh] rounded-2xl bg-background border border-border shadow-xl shadow-black/10 flex flex-col overflow-hidden">

            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/50">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Alertas del sistema</span>
                {total > 0 && <span className="text-xs text-muted-foreground">({total})</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleActualizar}
                  disabled={isFetching || generar.isPending}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Actualizar (vuelve a evaluar todas las reglas)"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching || generar.isPending ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => handleNavigate('/notificaciones')}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Ver todas las notificaciones"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-3 space-y-3">
              {isLoading && (
                <div className="text-center py-6 text-muted-foreground text-sm">Cargando alertas...</div>
              )}

              {!isLoading && total === 0 && (
                <div className="text-center py-8">
                  <Bell className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" />
                  <p className="text-sm text-foreground font-medium">Sin alertas activas</p>
                  <p className="text-xs text-muted-foreground mt-1">Todo en orden 👌</p>
                </div>
              )}

              {Object.entries(grupos).map(([grupo, groupItems]) => (
                <div key={grupo}>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                    {grupo}
                  </div>
                  <div className="space-y-1">
                    {groupItems.map(item => (
                      <NotifCard key={item.id} item={item} onNavigate={handleNavigate} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {total > 0 && (
              <div className="px-4 py-2.5 border-t border-border shrink-0 bg-muted/30">
                <p className="text-[10px] text-muted-foreground text-center">
                  Actualización automática cada 60 segundos
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NotifCard({ item, onNavigate }: { item: NotificacionItem; onNavigate: (url: string) => void }) {
  const cfg = URGENCIA_CONFIG[item.urgencia];
  const marcarLeida = useMarcarLeida();
  const posponer = usePosponerNotificacion();
  const descartar = useDescartarNotificacion();

  function manana8am(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  }

  async function accion(e: React.MouseEvent, fn: () => Promise<unknown>) {
    e.stopPropagation();
    try {
      await fn();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  return (
    <div className="group rounded-xl border border-transparent hover:border-border hover:bg-muted transition-colors">
      <button onClick={() => onNavigate(item.url_destino)} className="w-full text-left px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 justify-between">
              <p className="text-xs font-semibold text-foreground truncate">{item.titulo}</p>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.descripcion}</p>
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1 px-3 pb-2 pl-8 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => accion(e, () => marcarLeida.mutateAsync(item.id))}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-success px-1.5 py-0.5 rounded"
          title="Marcar como leída"
        >
          <Check className="h-3 w-3" /> Leída
        </button>
        <button
          onClick={e => accion(e, () => posponer.mutateAsync({ id: item.id, hasta: manana8am() }))}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-warning px-1.5 py-0.5 rounded"
          title="Recordarme mañana"
        >
          <Clock className="h-3 w-3" /> Mañana
        </button>
        <button
          onClick={e => accion(e, () => descartar.mutateAsync(item.id))}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-danger px-1.5 py-0.5 rounded"
          title="Descartar"
        >
          <X className="h-3 w-3" /> Descartar
        </button>
      </div>
    </div>
  );
}