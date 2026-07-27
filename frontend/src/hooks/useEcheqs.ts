import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Echeq, EcheqCreate, EcheqUpdate } from '@/types';

const KEY = 'echeqs';

export function useEcheqs(params?: { estado?: string; tipo?: string; cliente_id?: number }) {
  return useQuery({
    queryKey: [KEY, params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.estado) qs.set('estado', params.estado);
      if (params?.tipo) qs.set('tipo', params.tipo);
      if (params?.cliente_id) qs.set('cliente_id', String(params.cliente_id));
      const res = await api.get<{ data: Echeq[] }>(`/echeqs?${qs}`);
      return res.data.data;
    },
    enabled: params?.cliente_id === undefined || !!params.cliente_id,
  });
}

export function useCrearEcheq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EcheqCreate) => api.post<Echeq>('/echeqs', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });
}

export function useActualizarEcheq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: EcheqUpdate }) =>
      api.patch<Echeq>(`/echeqs/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });
}
