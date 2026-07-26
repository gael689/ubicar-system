import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse } from '@/types';

export interface TarjetaCliente {
  id: number;
  cliente_id: number;
  nombre_completo: string;
  nro_tarjeta: string;
  vencimiento: string;
  codigo_3_digitos: string;
  dni_titular: string;
  created_at: string;
  updated_at: string;
}

export interface TarjetaClienteInput {
  nombre_completo: string;
  nro_tarjeta: string;
  vencimiento: string;
  codigo_3_digitos: string;
  dni_titular: string;
}

const PIN = 'Ubicar123';

const KEYS = {
  tarjeta: (clienteId: number) => ['tarjeta', clienteId] as const,
};

export function useTarjeta(clienteId: number, enabled: boolean) {
  return useQuery({
    queryKey: KEYS.tarjeta(clienteId),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<TarjetaCliente | null>>(
        `/clientes/${clienteId}/tarjeta`,
        { headers: { 'x-tarjeta-pin': PIN } }
      );
      return data.data;
    },
    enabled: !!clienteId && enabled,
  });
}

export function useUpsertTarjeta(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TarjetaClienteInput) => {
      const { data } = await api.put<ApiResponse<TarjetaCliente>>(
        `/clientes/${clienteId}/tarjeta`,
        input,
        { headers: { 'x-tarjeta-pin': PIN } }
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.tarjeta(clienteId) });
      toast.success('Tarjeta guardada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeleteTarjeta(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete(`/clientes/${clienteId}/tarjeta`, {
        headers: { 'x-tarjeta-pin': PIN },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.tarjeta(clienteId) });
      toast.success('Tarjeta eliminada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
