import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ApiResponse, Semaforo } from '@/types';

// Fase 3, ítem 39: semáforo previo a check-out/check-in, sin abrir el modal.
export function usePreCheckout(reservaId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['reservas', reservaId, 'pre-checkout'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Semaforo>>(`/reservas/${reservaId}/pre-checkout`);
      return data.data;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function usePreCheckin(reservaId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['reservas', reservaId, 'pre-checkin'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Semaforo>>(`/reservas/${reservaId}/pre-checkin`);
      return data.data;
    },
    enabled,
    staleTime: 60_000,
  });
}
