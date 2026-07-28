import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CACHE } from '@/lib/queryClient';
import type { FechaEspecial, FechaEspecialCreate, FechaEspecialUpdate } from '@/types';

const KEY = 'fechas-especiales';

interface Params {
  desde?: string;
  hasta?: string;
  tipo?: string;
  incluir_inactivas?: boolean;
}

export function useFechasEspeciales(params?: Params) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.desde) qs.set('desde', params.desde);
      if (params?.hasta) qs.set('hasta', params.hasta);
      if (params?.tipo) qs.set('tipo', params.tipo);
      if (params?.incluir_inactivas) qs.set('incluir_inactivas', 'true');
      const res = await api.get<{ data: FechaEspecial[] }>(`/fechas-especiales?${qs}`);
      return res.data.data;
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useCrearFechaEspecial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: FechaEspecialCreate) =>
      api.post<{ data: FechaEspecial }>('/fechas-especiales', payload),
    onSuccess: invalidar,
  });
}

export function useActualizarFechaEspecial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FechaEspecialUpdate }) =>
      api.patch<{ data: FechaEspecial }>(`/fechas-especiales/${id}`, payload),
    onSuccess: invalidar,
  });
}

export function useDarDeBajaFechaEspecial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/fechas-especiales/${id}`),
    onSuccess: invalidar,
  });
}

export function useReactivarFechaEspecial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.post(`/fechas-especiales/${id}/reactivar`),
    onSuccess: invalidar,
  });
}

/**
 * Indexa las fechas especiales por día (`YYYY-MM-DD`) para poder preguntar
 * "¿qué pasa este día?" en O(1) mientras se pinta el calendario, en vez de
 * recorrer todos los rangos por cada celda.
 */
export function indexarPorDia(fechas: FechaEspecial[]): Map<string, FechaEspecial[]> {
  const mapa = new Map<string, FechaEspecial[]>();
  for (const f of fechas) {
    const cursor = new Date(`${f.fecha_desde}T12:00:00`);
    const fin = new Date(`${f.fecha_hasta}T12:00:00`);
    while (cursor <= fin) {
      const clave = cursor.toISOString().slice(0, 10);
      const previas = mapa.get(clave);
      if (previas) previas.push(f);
      else mapa.set(clave, [f]);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return mapa;
}
