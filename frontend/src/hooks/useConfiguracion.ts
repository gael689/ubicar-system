import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ApiResponse, ConfiguracionItem } from '@/types';

export function useConfiguracion() {
  return useQuery({
    queryKey: ['configuracion'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ConfiguracionItem[]>>('/configuracion');
      return data.data;
    },
  });
}

export function useUpdateConfiguracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clave, valor }: { clave: string; valor: string }) => {
      const { data } = await api.patch<ApiResponse<ConfiguracionItem>>(`/configuracion/${clave}`, { valor });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracion'] }),
  });
}
