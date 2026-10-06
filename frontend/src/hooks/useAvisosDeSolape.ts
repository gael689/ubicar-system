import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ApiResponse, AvisosDeSolape } from '@/types';

export interface ParamsAvisosDeSolape {
  vehiculo_id: number;
  fecha_inicio: string;
  hora_inicio: string;
  fecha_fin: string;
  hora_fin: string;
  excluir_reserva_id?: number;
}

/**
 * Con qué se pisaría una reserva así, **antes de guardarla**.
 *
 * El sistema avisa y deja seguir: un auto que vuelve a las 9:00 se puede
 * entregar a las 10:00, y hasta uno pisado de verdad se puede cargar si el
 * mostrador lo decide. Lo único que sigue impidiendo guardar es un auto en el
 * taller o con uso interno (`bloqueo`).
 *
 * `null` no consulta: mientras falta el auto o las fechas no hay nada que
 * preguntar. Es una lectura, no toma ningún lock en el servidor.
 */
export function useAvisosDeSolape(params: ParamsAvisosDeSolape | null) {
  return useQuery({
    queryKey: ['reservas', 'avisos-de-solape', params],
    enabled: params !== null,
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<AvisosDeSolape>>(
        '/reservas/avisos-de-solape', { params },
      );
      return data.data;
    },
    // Lo que se pisa cambia con cada reserva que entra: no se reusa.
    staleTime: 0,
  });
}
