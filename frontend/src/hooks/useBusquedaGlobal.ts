import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ApiResponse } from '@/types';

export interface ResultadoBusqueda {
  tipo: 'cliente' | 'vehiculo' | 'reserva';
  id: number;
  titulo: string;
  subtitulo: string;
  url: string;
}

// Fase 3, ítem 42: búsqueda global Cmd/Ctrl+K.
export function useBusquedaGlobal(q: string) {
  return useQuery({
    queryKey: ['buscar', q],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ResultadoBusqueda[]>>('/buscar', { params: { q } });
      return data.data;
    },
    enabled: q.trim().length > 0,
    staleTime: 30_000,
  });
}
