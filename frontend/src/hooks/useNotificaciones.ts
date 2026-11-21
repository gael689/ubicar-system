import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  ApiResponse, NotificacionesResponse, NotificacionItem, OportunidadesResponse, PaginatedResponse,
} from '@/types';

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

/**
 * Las oportunidades 💡. Tienen su propio endpoint porque **no son avisos**: no
 * suman a la campana ni a su número.
 *
 * La clave empieza con `notificaciones` a propósito: leer, posponer o
 * descartar una invalida esa raíz, y con eso esta lista se refresca sola.
 */
export function useOportunidades() {
  return useQuery({
    queryKey: ['notificaciones', 'oportunidades'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<OportunidadesResponse>>('/oportunidades');
      return data.data;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}

interface HistorialParams {
  page?: number;
  soloResueltas?: boolean;
  fecha?: string | null;
  anio?: number | null;
  mes?: number | null;
  /** Uno o varios `tipo`; el backend los acepta separados por coma. */
  tipos?: string[];
  urgencias?: string[];
  /** Uno o varios módulos (`cobranzas`, `flota`…). */
  modulos?: string[];
}

export function useHistorialNotificaciones({
  page = 1, soloResueltas = true, fecha, anio, mes, tipos, urgencias, modulos,
}: HistorialParams = {}) {
  return useQuery({
    queryKey: ['notificaciones', 'historial', page, soloResueltas, fecha, anio, mes, tipos, urgencias, modulos],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = { page, solo_resueltas: soloResueltas };
      if (fecha) params.fecha = fecha;
      else {
        if (anio) params.anio = anio;
        if (mes) params.mes = mes;
      }
      if (tipos?.length) params.tipo = tipos.join(',');
      if (urgencias?.length) params.urgencia = urgencias.join(',');
      if (modulos?.length) params.modulo = modulos.join(',');
      const { data } = await api.get<PaginatedResponse<NotificacionItem>>('/notificaciones/historial', { params });
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

/** "Marcar todo como leído": de todo, o de un módulo. Es el acuse de quien lo
 *  aprieta; al resto del equipo no le esconde nada. */
export function useLeerTodas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modulo?: string | null) => {
      const { data } = await api.post('/notificaciones/leer-todas', modulo ? { modulo } : {});
      return data.data as { marcadas: number };
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
