import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { OcupacionResponse, ResumenAnualResponse, ApiResponse } from '@/types';

interface OcupacionParams {
  fecha_inicio: string;
  fecha_fin: string;
  vehiculo_ids?: number[];
}

/**
 * Plan de conexión (13/08), cierra C-5: **el calendario no se refrescaba
 * nunca.** Esto era `useState` + `useCallback` a mano, no react-query — así
 * que los `invalidateQueries({queryKey: ['ocupacion']})` que ya estaban
 * escritos en `useResolverReserva`/`useReservasWeb` no invalidaban nada,
 * porque esa clave no existía en ningún cache. Asignar el auto desde el
 * panel guardaba bien en el backend, y el calendario seguía mostrando lo de
 * antes hasta que alguien apretaba F5.
 *
 * Con `queryKey: ['ocupacion', ...]`, esos `invalidateQueries` empiezan a
 * funcionar solos —react-query invalida por prefijo de clave, no hace falta
 * tocar los mutation hooks—, y se suma `refetchInterval` para que una
 * reserva web que entra sola (sin que nadie la haya tocado desde acá) también
 * aparezca sin recargar la página.
 */
export function useOcupacion(params: OcupacionParams | null) {
  return useQuery({
    queryKey: ['ocupacion', params?.fecha_inicio, params?.fecha_fin, params?.vehiculo_ids],
    queryFn: async () => {
      const queryParams: Record<string, unknown> = {
        fecha_inicio: params!.fecha_inicio,
        fecha_fin: params!.fecha_fin,
      };
      if (params?.vehiculo_ids?.length) {
        queryParams.vehiculo_ids = params.vehiculo_ids;
      }
      const { data } = await api.get<ApiResponse<OcupacionResponse>>('/ocupacion', {
        params: queryParams,
      });
      return data.data;
    },
    enabled: params !== null,
    refetchInterval: 60_000,
  });
}

/** GET /ocupacion/resumen-anual — la pre-vista del año (2.8). */
export function useResumenAnual(anio: number) {
  return useQuery({
    queryKey: ['ocupacion', 'resumen-anual', anio],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ResumenAnualResponse>>(
        '/ocupacion/resumen-anual',
        { params: { anio } },
      );
      return data.data;
    },
  });
}
