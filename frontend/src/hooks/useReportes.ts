import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ReporteIngresos, ReporteVehiculo } from '@/types';

export function useReporteIngresos(anio: number) {
  return useQuery({
    queryKey: ['reportes', 'ingresos', anio],
    queryFn: async () => {
      const res = await api.get<ReporteIngresos>(`/reportes/ingresos?anio=${anio}`);
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useReporteFlota(fechaDesde: string, fechaHasta: string) {
  return useQuery({
    queryKey: ['reportes', 'flota', fechaDesde, fechaHasta],
    queryFn: async () => {
      const res = await api.get<ReporteVehiculo[]>(
        `/reportes/flota?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`
      );
      return res.data;
    },
    enabled: !!fechaDesde && !!fechaHasta,
    staleTime: 5 * 60_000,
  });
}
