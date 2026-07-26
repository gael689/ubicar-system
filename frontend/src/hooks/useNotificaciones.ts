import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ApiResponse, NotificacionesResponse } from '@/types';

export function useNotificaciones() {
  return useQuery({
    queryKey: ['notificaciones'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<NotificacionesResponse>>('/notificaciones');
      return data.data;
    },
    refetchInterval: 60_000, // re-fetch cada 60 segundos
    staleTime: 30_000,
  });
}
