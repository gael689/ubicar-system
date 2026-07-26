import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse, ConductorAdicional, ConductorAdicionalCreate } from '@/types';

const KEYS = {
  all: (clienteId: number) => ['conductores', clienteId] as const,
};

export function useConductores(clienteId: number) {
  return useQuery({
    queryKey: KEYS.all(clienteId),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ConductorAdicional[]>>(`/clientes/${clienteId}/conductores`);
      return data.data;
    },
    enabled: !!clienteId,
  });
}

export function useAddConductor(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ConductorAdicionalCreate) => {
      const { data } = await api.post<ApiResponse<ConductorAdicional>>(`/clientes/${clienteId}/conductores`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all(clienteId) });
      toast.success('Conductor adicional agregado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeleteConductor(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/clientes/${clienteId}/conductores/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all(clienteId) });
      toast.success('Conductor eliminado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
