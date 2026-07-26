import { useMemo } from 'react';
import { Receipt, Wrench } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

import { useGastos } from '@/hooks/useGastos';
import { useServicios } from '@/hooks/useServicios';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Servicio, TipoServicio } from '@/types';

interface Props {
  vehiculoId: number;
}

const TIPO_SERVICIO_LABEL: Record<TipoServicio, string> = {
  service_general: 'Service general',
  aceite:          'Cambio aceite',
  neumaticos:      'Neumáticos',
  frenos:          'Frenos',
  filtros:         'Filtros',
  correa:          'Correa distribución',
  suspension:      'Suspensión',
  otro:            'Otro',
};

export function HistorialTab({ vehiculoId }: Props) {
  const { data: gastosData, isLoading: gastosLoading } = useGastos(vehiculoId, { page: 1, page_size: 200 });
  const { data: servicios = [], isLoading: serviciosLoading } = useServicios(vehiculoId);

  const gastos = gastosData?.data ?? [];

  const items = useMemo(() => {
    type Item =
      | { kind: 'gasto'; fecha: string; data: typeof gastos[0] }
      | { kind: 'servicio'; fecha: string; data: Servicio };
    const g: Item[] = gastos.map(g => ({ kind: 'gasto' as const, fecha: g.fecha, data: g }));
    const s: Item[] = servicios.map(s => ({ kind: 'servicio' as const, fecha: s.fecha, data: s }));
    return [...g, ...s].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [gastos, servicios]);

  if (gastosLoading || serviciosLoading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Wrench}
          title="Sin historial de gastos"
          description="Los gastos y mantenimientos registrados aparecerán acá."
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Historial de gastos y mantenimiento ({items.length} registros)
      </h3>
      <div className="relative pl-6 space-y-0">
        <div className="absolute left-2.5 top-1 bottom-1 w-px bg-border" />
        {items.map(item => {
          const isGasto = item.kind === 'gasto';
          const titulo = isGasto
            ? item.data.descripcion
            : (item.data.tipo === 'otro' && item.data.descripcion
                ? item.data.descripcion
                : TIPO_SERVICIO_LABEL[item.data.tipo]);
          const subtitulo = isGasto
            ? `Gasto · ${item.data.medio_pago}${item.data.proveedor ? ` · ${item.data.proveedor}` : ''}`
            : `Mantenimiento · ${item.data.km_realizado.toLocaleString()} km${item.data.proximo_km ? ` · próx: ${item.data.proximo_km.toLocaleString()}` : ''}`;
          const monto = isGasto
            ? Number(item.data.monto)
            : (item.data.costo ? Number(item.data.costo) : null);

          return (
            <div key={`${item.kind}-${item.data.id}`} className="relative flex items-start gap-3 py-2.5">
              <div className="absolute left-[-17px] top-3 h-5 w-5 rounded-full border-2 border-background bg-card flex items-center justify-center">
                {isGasto
                  ? <Receipt className="h-3 w-3 text-warning" />
                  : <Wrench className="h-3 w-3 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{titulo}</span>
                  {monto != null && (
                    <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                      {formatCurrency(String(monto))}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(item.fecha)} · {subtitulo}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
