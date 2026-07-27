import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ApiResponse, NotificacionesResponse, NotificacionItem, PreferenciaNotificacion, PaginatedResponse } from '@/types';

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

export function useHistorialNotificaciones(page = 1) {
  return useQuery({
    queryKey: ['notificaciones', 'historial', page],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<NotificacionItem>>(`/notificaciones/historial?page=${page}`);
      return data;
    },
  });
}

export function useGenerarNotificaciones() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/notificaciones/generar');
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useMarcarLeida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/notificaciones/${id}/leer`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function usePosponerNotificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hasta }: { id: number; hasta: string }) => {
      const { data } = await api.post(`/notificaciones/${id}/posponer`, { hasta });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function useDescartarNotificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/notificaciones/${id}/descartar`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}

export function usePreferenciasNotificacion() {
  return useQuery({
    queryKey: ['notificaciones', 'preferencias'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<PreferenciaNotificacion[]>>('/notificaciones/preferencias');
      return data.data;
    },
  });
}

export function useSetPreferenciaNotificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { tipo_regla: string; canales: string[]; anticipacion_dias: number | null; activo: boolean }) => {
      const { data } = await api.put('/notificaciones/preferencias', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones', 'preferencias'] }),
  });
}
