import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { extractError } from '@/lib/utils';

export interface MiUsuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  /** `false` si el nombre es de relleno ("Operador", el ID de Clerk, la parte del mail). */
  nombre_presentable: boolean;
}

const KEY = ['usuarios', 'me'] as const;

/**
 * Quién está usando el sistema. Existe por el pie del contrato: *"Usted fue
 * atendido por"* sale de este nombre (plan 27/09, A4).
 */
export function useMiUsuario() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get<{ data: MiUsuario }>('/usuarios/me');
      return data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useActualizarMiNombre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { data } = await api.patch<{ data: MiUsuario }>('/usuarios/me', { nombre });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Listo: los próximos contratos salen con tu nombre');
    },
    onError: err => toast.error(extractError(err)),
  });
}
