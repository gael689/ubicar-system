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

/**
 * El semáforo de una reserva **que todavía no existe**.
 *
 * Es el mismo criterio que `usePreCheckout`, evaluado sobre los datos que hay
 * cargados en el formulario. Existe para que el resumen del alta no tenga que
 * armar su propia lista de faltantes: dos listas que dicen parecido son dos
 * listas que en algún momento dicen distinto, y la que el operador cree es la
 * que tiene delante.
 */
export function usePreCheckoutPrevio(params: {
  cliente_id?: number | null;
  conductor_id?: number | null;
  vehiculo_id?: number | null;
  garantia_tipo?: string | null;
}, enabled: boolean) {
  return useQuery({
    queryKey: ['reservas', 'pre-checkout-previo', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Semaforo>>(
        '/reservas/pre-checkout-previo',
        {
          params: {
            cliente_id: params.cliente_id ?? undefined,
            conductor_id: params.conductor_id ?? undefined,
            vehiculo_id: params.vehiculo_id ?? undefined,
            garantia_tipo: params.garantia_tipo ?? undefined,
          },
        },
      );
      return data.data;
    },
    enabled,
    staleTime: 15_000,
  });
}
