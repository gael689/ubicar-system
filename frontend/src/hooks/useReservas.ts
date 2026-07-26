import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type {
  Reserva,
  ReservaCreate,
  ReservaUpdate,
  SolapeWarning,
  PaginatedResponse,
  ApiResponse,
} from '@/types';

interface ListReservasParams {
  estado?: string;
  vehiculo_id?: number;
  cliente_id?: number;
  q?: string;
  fecha?: string;
  page?: number;
  page_size?: number;
}

interface CreateReservaResult {
  reserva: Reserva;
  warnings: SolapeWarning[];
}

export function useReservas() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listReservas = useCallback(
    async (params: ListReservasParams = {}): Promise<PaginatedResponse<Reserva>> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<PaginatedResponse<Reserva>>('/reservas', { params });
        return data;
      } catch (err: any) {
        const msg = err?.response?.data?.detail?.message
          || err?.response?.data?.detail
          || 'Error al cargar reservas';
        setError(typeof msg === 'string' ? msg : 'Error al cargar reservas');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getReserva = useCallback(
    async (id: number): Promise<Reserva> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ApiResponse<Reserva>>(`/reservas/${id}`);
        return data.data;
      } catch (err: any) {
        setError('Error al cargar reserva');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const createReserva = useCallback(
    async (payload: ReservaCreate): Promise<CreateReservaResult> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<any>>('/reservas', payload);
        const { warnings, ...rest } = data.data;
        return { reserva: rest as Reserva, warnings: warnings ?? [] };
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al crear reserva');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateReserva = useCallback(
    async (id: number, payload: ReservaUpdate): Promise<Reserva> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.patch<ApiResponse<Reserva>>(`/reservas/${id}`, payload);
        return data.data;
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al actualizar');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const confirmarReserva = useCallback(
    async (id: number): Promise<Reserva> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<Reserva>>(`/reservas/${id}/confirmar`);
        return data.data;
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al confirmar');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const cancelarReserva = useCallback(
    async (id: number): Promise<Reserva> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<Reserva>>(`/reservas/${id}/cancelar`);
        return data.data;
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al cancelar');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reasignarReserva = useCallback(
    async (id: number, vehiculo_id_nuevo: number): Promise<{ reserva: Reserva; warnings: SolapeWarning[] }> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<any>>(`/reservas/${id}/reasignar`, { vehiculo_id_nuevo });
        const { warnings, ...rest } = data.data;
        return { reserva: rest as Reserva, warnings: warnings ?? [] };
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        setError(detail?.message || 'Error al reasignar');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getReservasAReasignar = useCallback(async (): Promise<Reserva[]> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ApiResponse<Reserva[]>>('/reservas/a-reasignar');
      return data.data;
    } catch (err: any) {
      setError('Error al cargar reservas a reasignar');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    listReservas,
    getReserva,
    createReserva,
    updateReserva,
    confirmarReserva,
    cancelarReserva,
    reasignarReserva,
    getReservasAReasignar,
  };
}
