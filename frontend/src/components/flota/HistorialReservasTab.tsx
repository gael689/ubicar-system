import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Gauge } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';

import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Alquiler, PaginatedResponse, Reserva } from '@/types';

interface Props {
  vehiculoId: number;
}

export function HistorialReservasTab({ vehiculoId }: Props) {
  const { data: reservasData, isLoading: reservasLoading } = useQuery({
    queryKey: ['vehiculos', vehiculoId, 'reservas-historial'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Reserva>>('/reservas', {
        params: { vehiculo_id: vehiculoId, page_size: 100, page: 1 },
      });
      return data;
    },
    enabled: !!vehiculoId,
  });

  const { data: alquileresData, isLoading: alquileresLoading } = useQuery({
    queryKey: ['vehiculos', vehiculoId, 'alquileres-historial'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Alquiler>>('/alquileres', {
        params: { vehiculo_id: vehiculoId, page_size: 100, page: 1 },
      });
      return data;
    },
    enabled: !!vehiculoId,
  });

  const alquilerPorReserva = useMemo(() => {
    const map = new Map<number, Alquiler>();
    (alquileresData?.data ?? []).forEach(a => map.set(a.reserva_id, a));
    return map;
  }, [alquileresData]);

  const reservas = (reservasData?.data ?? []).slice().sort((a, b) =>
    b.fecha_inicio.localeCompare(a.fecha_inicio)
  );

  if (reservasLoading || alquileresLoading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </Card>
    );
  }

  if (reservas.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Calendar}
          title="Sin reservas"
          description="Este vehículo todavía no tiene reservas registradas."
        />
      </Card>
    );
  }

  const ESTADO_COLOR: Record<string, string> = {
    confirmada: 'bg-blue-100 text-blue-700',
    activa:     'bg-emerald-100 text-emerald-700',
    finalizada: 'bg-slate-100 text-slate-600',
    cancelada:  'bg-red-100 text-red-600',
  };

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Reservas del vehículo ({reservas.length})
      </h3>
      <div className="divide-y divide-border rounded-lg border">
        {reservas.map(r => {
          const alquiler = alquilerPorReserva.get(r.id);
          const kmSalida   = alquiler?.checkout_km ?? null;
          const kmLlegada  = alquiler?.checkin_km  ?? null;
          const kmRecorrid = kmSalida != null && kmLlegada != null
            ? kmLlegada - kmSalida
            : null;

          return (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {r.cliente?.nombre_completo ?? `Cliente #${r.cliente_id}`}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${ESTADO_COLOR[r.estado] ?? ''}`}>
                      {r.estado}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(r.fecha_inicio)} → {formatDate(r.fecha_fin)}
                    {r.lugar_entrega && ` · ${r.lugar_entrega}`}
                  </div>

                  {/* KM history */}
                  {alquiler && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <Gauge className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Salida: <span className="font-medium text-foreground tabular-nums">
                          {kmSalida?.toLocaleString('es-AR')} km
                        </span>
                      </span>
                      {kmLlegada != null && (
                        <>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-xs text-muted-foreground">
                            Llegada: <span className="font-medium text-foreground tabular-nums">
                              {kmLlegada.toLocaleString('es-AR')} km
                            </span>
                          </span>
                          {kmRecorrid != null && (
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium text-foreground tabular-nums">
                              +{kmRecorrid.toLocaleString('es-AR')} km
                            </span>
                          )}
                        </>
                      )}
                      {kmLlegada == null && (
                        <span className="text-xs text-amber-600 font-medium">en curso</span>
                      )}
                    </div>
                  )}

                  {r.notas && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">"{r.notas}"</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {r.precio_total ? (
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatCurrency(r.precio_total)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sin precio</span>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-0.5">#{r.id}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
