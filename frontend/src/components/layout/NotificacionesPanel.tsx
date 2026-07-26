import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, ChevronRight, RefreshCw } from 'lucide-react';
import { useNotificaciones } from '@/hooks/useNotificaciones';
import type { NotificacionItem, UrgenciaNot } from '@/types';

const URGENCIA_CONFIG: Record<UrgenciaNot, { dot: string }> = {
  alta:  { dot: 'bg-red-500'   },
  media: { dot: 'bg-amber-500' },
  baja:  { dot: 'bg-slate-400' },
};

const TIPO_GRUPO: Record<string, string> = {
  checkout_pendiente:       '🚗 Check-ins pendientes',
  checkin_pendiente:        '🏁 Check-outs pendientes',
  garantia_sin_resolver:    '🔒 Garantías',
  doc_vehiculo_vencido:     '📄 Documentos vehículos',
  doc_vehiculo_por_vencer:  '📄 Documentos vehículos',
  doc_cliente_vencido:      '👤 Documentos clientes',
  doc_cliente_por_vencer:   '👤 Documentos clientes',
  service_vencido:          '🔧 Mantenimiento',
  service_proximo:          '🔧 Mantenimiento',
  multa_pendiente:          '⚠️ Multas',
};

export function NotificacionesPanel() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, refetch, isFetching } = useNotificaciones();
  const navigate = useNavigate();

  const total    = data?.total    ?? 0;
  const urgentes = data?.urgentes ?? 0;
  const items    = data?.items    ?? [];

  const grupos = items.reduce<Record<string, NotificacionItem[]>>((acc, item) => {
    const grupo = TIPO_GRUPO[item.tipo] ?? 'Otros';
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(item);
    return acc;
  }, {});

  function handleNavigate(url: string) {
    navigate(url);
    setOpen(false);
  }

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
        title="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${
            urgentes > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Panel — abre hacia ARRIBA desde el botón, tema claro */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-12 bottom-0 z-50 w-96 max-h-[80vh] rounded-2xl bg-background border border-border shadow-xl shadow-black/10 flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/50">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Alertas del sistema</span>
                {total > 0 && (
                  <span className="text-xs text-muted-foreground">({total})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Actualizar"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content */}
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
                    {groupItems.map((item, i) => (
                      <NotifCard key={i} item={item} onNavigate={handleNavigate} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
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
  return (
    <button
      onClick={() => onNavigate(item.url_destino)}
      className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-muted transition-colors border border-transparent hover:border-border group"
    >
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
  );
}
