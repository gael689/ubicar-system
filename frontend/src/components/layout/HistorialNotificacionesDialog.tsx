import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHistorialNotificaciones } from '@/hooks/useNotificaciones';
import { formatDate } from '@/lib/utils';
import type { EstadoNotificacion } from '@/types';

const ESTADO_LABEL: Record<EstadoNotificacion, string> = {
  pendiente: 'Pendiente',
  enviada: 'Enviada',
  leida: 'Leída',
  pospuesta: 'Pospuesta',
  descartada: 'Descartada',
  resuelta: 'Resuelta sola',
};

const ESTADO_COLOR: Record<EstadoNotificacion, string> = {
  pendiente: 'bg-muted text-muted-foreground',
  enviada: 'bg-muted text-muted-foreground',
  leida: 'bg-primary/10 text-primary',
  pospuesta: 'bg-warning/10 text-warning',
  descartada: 'bg-danger/10 text-danger',
  resuelta: 'bg-success/10 text-success',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HistorialNotificacionesDialog({ open, onClose }: Props) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useHistorialNotificaciones(page);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Historial de notificaciones</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground text-center py-6">Cargando...</p>}
          {!isLoading && (data?.data.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Sin notificaciones en el historial todavía</p>
          )}
          {data?.data.map(n => (
            <div key={n.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground truncate">{n.titulo}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${ESTADO_COLOR[n.estado]}`}>
                  {ESTADO_LABEL[n.estado]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{n.descripcion}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{formatDate(n.created_at)}</p>
            </div>
          ))}
        </div>

        {data && data.total > data.page_size && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            >
              ← Anterior
            </button>
            <span className="text-xs text-muted-foreground">
              Página {data.page} de {Math.ceil(data.total / data.page_size)}
            </span>
            <button
              disabled={page * data.page_size >= data.total}
              onClick={() => setPage(p => p + 1)}
              className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
            >
              Siguiente →
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
