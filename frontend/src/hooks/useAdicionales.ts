import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CACHE } from '@/lib/queryClient';
import type {
  Adicional, AdicionalCreate, AdicionalUpdate, GrupoAdicional,
} from '@/types';

const KEY = 'adicionales';

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useAdicionales(params?: {
  grupo?: GrupoAdicional;
  solo_web?: boolean;
  incluir_inactivos?: boolean;
}) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.grupo) qs.set('grupo', params.grupo);
      if (params?.solo_web) qs.set('solo_web', 'true');
      if (params?.incluir_inactivos) qs.set('incluir_inactivos', 'true');
      const res = await api.get<{ data: Adicional[] }>(`/adicionales?${qs}`);
      return res.data.data;
    },
  });
}

export function useCrearAdicional() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: AdicionalCreate) =>
      api.post<{ data: Adicional }>('/adicionales', payload),
    onSuccess: invalidar,
  });
}

/** Cambiar el precio acá NO reescribe las reservas ya cargadas. */
export function useActualizarAdicional() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AdicionalUpdate }) =>
      api.patch<{ data: Adicional }>(`/adicionales/${id}`, payload),
    onSuccess: invalidar,
  });
}

export function useDarDeBajaAdicional() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/adicionales/${id}`),
    onSuccess: invalidar,
  });
}

export function useReactivarAdicional() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.post(`/adicionales/${id}/reactivar`),
    onSuccess: invalidar,
  });
}
