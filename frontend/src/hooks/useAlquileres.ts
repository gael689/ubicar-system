import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  Alquiler,
  CheckoutCreate,
  CheckinCreate,
  PreviewExcedente,
  ExtenderRequest,
  ExtenderResponse,
  PaginatedResponse,
  ApiResponse,
} from '@/types';

interface ListAlquileresParams {
  vehiculo_id?: number;
  cliente_id?: number;
  con_checkin_pendiente?: boolean;
  page?: number;
  page_size?: number;
}

export function useAlquileres() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const listAlquileres = useCallback(
    async (params: ListAlquileresParams = {}): Promise<PaginatedResponse<Alquiler>> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<PaginatedResponse<Alquiler>>('/alquileres', { params });
        return data;
      } catch (err: any) {
        setError('Error al cargar alquileres');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getAlquiler = useCallback(
    async (id: number): Promise<Alquiler> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ApiResponse<Alquiler>>(`/alquileres/${id}`);
        return data.data;
      } catch (err: any) {
        setError('Error al cargar alquiler');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const checkout = useCallback(
    async (reservaId: number, payload: Omit<CheckoutCreate, 'reserva_id'>): Promise<{ alquiler: Alquiler; warnings: any[] }> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<any>>(`/reservas/${reservaId}/checkout`, {
          ...payload,
          reserva_id: reservaId,
        });
        const { warnings, ...alquiler } = data.data;
        queryClient.invalidateQueries({ queryKey: ['vehiculos'] });
        queryClient.invalidateQueries({ queryKey: ['reservas'] });
        queryClient.invalidateQueries({ queryKey: ['pagos'] });
        queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
        queryClient.invalidateQueries({ queryKey: ['reportes'] });
        return { alquiler: alquiler as Alquiler, warnings: warnings ?? [] };
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error en el checkout');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [queryClient]
  );

  const previewExcedente = useCallback(
    async (alquilerID: number, checkinFecha: string, checkinHora: string): Promise<PreviewExcedente> => {
      try {
        const { data } = await api.get<ApiResponse<PreviewExcedente>>(
          `/alquileres/${alquilerID}/preview-excedente`,
          { params: { checkin_fecha: checkinFecha, checkin_hora: checkinHora } }
        );
        return data.data;
      } catch (err: any) {
        throw err;
      }
    },
    []
  );

  const checkin = useCallback(
    async (alquilerID: number, payload: CheckinCreate): Promise<Alquiler> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<ApiResponse<Alquiler>>(`/alquileres/${alquilerID}/checkin`, payload);
        queryClient.invalidateQueries({ queryKey: ['vehiculos'] });
        queryClient.invalidateQueries({ queryKey: ['reservas'] });
        queryClient.invalidateQueries({ queryKey: ['pagos'] });
        queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
        queryClient.invalidateQueries({ queryKey: ['reportes'] });
        queryClient.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
        return data.data;
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error en el checkin');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [queryClient]
  );

  const extender = useCallback(
    async (alquilerID: number, payload: ExtenderRequest): Promise<ExtenderResponse> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.patch<ApiResponse<ExtenderResponse>>(`/alquileres/${alquilerID}/extender`, payload);
        return data.data;
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        const msg = detail?.message || (typeof detail === 'string' ? detail : 'Error al extender');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    listAlquileres,
    getAlquiler,
    checkout,
    previewExcedente,
    checkin,
    extender,
  };
}
