import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, DashboardDetalle } from '@/types';

export function useDashboardStats(fecha?: string) {
  return useQuery({
    queryKey: ['reportes', 'dashboard', fecha],
    queryFn: async () => {
      const params = fecha ? { fecha } : {};
      const { data } = await api.get<ApiResponse<DashboardDetalle>>('/reportes/dashboard', { params });
      return data.data;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
