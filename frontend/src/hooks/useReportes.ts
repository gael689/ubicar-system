import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CACHE } from '@/lib/queryClient';
import type { ApiResponse, ReporteIngresos, ReporteVehiculo } from '@/types';

export function useReporteIngresos(anio: number) {
  return useQuery({
    ...CACHE.HISTORICO,
    queryKey: ['reportes', 'ingresos', anio],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ReporteIngresos>>(`/reportes/ingresos?anio=${anio}`);
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useReporteFlota(fechaDesde: string, fechaHasta: string) {
  return useQuery({
    ...CACHE.HISTORICO,
    queryKey: ['reportes', 'flota', fechaDesde, fechaHasta],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ReporteVehiculo[]>>(
        `/reportes/flota?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`
      );
      return res.data.data;
    },
    enabled: !!fechaDesde && !!fechaHasta,
    staleTime: 5 * 60_000,
  });
}
