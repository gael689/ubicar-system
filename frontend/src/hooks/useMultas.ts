import { useCallback, useState } from 'react';
import api from '@/lib/api';
import type { ApiResponse, PaginatedResponse, Multa, MultaCreate, MultaUpdate, BusquedaMultaResult, ResolverMultaPayload } from '@/types';

export function useMultas() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listMultas = useCallback(async (params?: {
    cliente_id?: number;
    vehiculo_id?: number;
    estado?: string;
    patente?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Multa>> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<Multa>>('/multas', { params });
      return data;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Error al cargar multas';
      setError(typeof msg === 'string' ? msg : msg?.message || 'Error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const buscarResponsable = useCallback(async (
    patente: string,
    fecha: string,
    hora?: string,
  ): Promise<BusquedaMultaResult> => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { patente, fecha };
      if (hora) params.hora = hora;
      const { data } = await api.get<ApiResponse<BusquedaMultaResult>>('/multas/buscar', { params });
      return data.data;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Error al buscar';
      setError(typeof msg === 'string' ? msg : msg?.message || 'Error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const crearMulta = useCallback(async (payload: MultaCreate): Promise<Multa> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<ApiResponse<Multa>>('/multas', payload);
      return data.data;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Error al crear multa';
      setError(typeof msg === 'string' ? msg : msg?.message || 'Error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const actualizarMulta = useCallback(async (id: number, payload: MultaUpdate): Promise<Multa> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.patch<ApiResponse<Multa>>(`/multas/${id}`, payload);
      return data.data;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Error al actualizar multa';
      setError(typeof msg === 'string' ? msg : msg?.message || 'Error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const eliminarMulta = useCallback(async (id: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/multas/${id}`);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Error al eliminar multa';
      setError(typeof msg === 'string' ? msg : msg?.message || 'Error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const resolverMulta = useCallback(async (id: number, payload: ResolverMultaPayload): Promise<Multa> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<ApiResponse<Multa>>(`/multas/${id}/resolver`, payload);
      return data.data;
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Error al resolver la multa';
      setError(typeof msg === 'string' ? msg : msg?.message || 'Error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, listMultas, buscarResponsable, crearMulta, actualizarMulta, eliminarMulta, resolverMulta };
}
