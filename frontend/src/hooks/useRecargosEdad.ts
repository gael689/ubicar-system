import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RecargoEdad, RecargoEdadCreate, RecargoEdadUpdate } from '@/types';

const KEY = 'recargos-edad';

export function useRecargosEdad(incluirInactivos = false) {
  return useQuery({
    queryKey: [KEY, incluirInactivos],
    queryFn: async () => {
      const res = await api.get<{ data: RecargoEdad[] }>('/recargos-edad', {
        params: { incluir_inactivos: incluirInactivos },
      });
      return res.data.data;
    },
  });
}

export function useCrearRecargoEdad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecargoEdadCreate) =>
      api.post<{ data: RecargoEdad }>('/recargos-edad', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useActualizarRecargoEdad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & RecargoEdadUpdate) =>
      api.patch<{ data: RecargoEdad }>(`/recargos-edad/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Baja lógica: las reservas que ya lo aplicaron conservan su explicación. */
export function useDarDeBajaRecargoEdad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/recargos-edad/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
