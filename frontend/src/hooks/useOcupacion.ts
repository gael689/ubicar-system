import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type { OcupacionResponse, ApiResponse } from '@/types';

interface OcupacionParams {
  fecha_inicio: string;
  fecha_fin: string;
  vehiculo_ids?: number[];
}

export function useOcupacion() {
  const [data, setData] = useState<OcupacionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOcupacion = useCallback(
    async (params: OcupacionParams): Promise<OcupacionResponse> => {
      setLoading(true);
      setError(null);
      try {
        const queryParams: Record<string, any> = {
          fecha_inicio: params.fecha_inicio,
          fecha_fin: params.fecha_fin,
        };
        if (params.vehiculo_ids?.length) {
          queryParams.vehiculo_ids = params.vehiculo_ids;
        }
        const { data: resp } = await api.get<ApiResponse<OcupacionResponse>>('/ocupacion', {
          params: queryParams,
        });
        const result = resp.data;
        setData(result);
        return result;
      } catch (err: any) {
        setError('Error al cargar ocupación');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { data, loading, error, fetchOcupacion };
}
