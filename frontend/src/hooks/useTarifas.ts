import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse } from '@/types';

export interface Tarifa {
  id: number;
  vehiculo_id: number | null;
  tipo: 'diaria' | 'semanal' | 'mensual';
  monto: number;
  activo: boolean;
  vigencia_desde: string;
}

export interface TarifaCreate {
  tipo: 'diaria' | 'semanal' | 'mensual';
  monto: number;
  vigencia_desde?: string | null;
}

export interface TarifaUpdate {
  monto?: number;
  vigencia_desde?: string | null;
}

const KEYS = {
  all: (vehiculoId: number) => ['tarifas', vehiculoId] as const,
};

export function useTarifas(vehiculoId: number, incluirInactivas = false) {
  return useQuery({
    queryKey: [...KEYS.all(vehiculoId), { incluirInactivas }],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Tarifa[]>>(
        `/vehiculos/${vehiculoId}/tarifas`,
        { params: { incluir_inactivas: incluirInactivas } }
      );
      return data.data;
    },
    enabled: !!vehiculoId,
  });
}

export function useCreateTarifa(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TarifaCreate) => {
      const { data } = await api.post<ApiResponse<Tarifa>>(
        `/vehiculos/${vehiculoId}/tarifas`, body
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all(vehiculoId) });
      toast.success('Tarifa creada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useUpdateTarifa(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: TarifaUpdate }) => {
      const { data } = await api.patch<ApiResponse<Tarifa>>(`/tarifas/${id}`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all(vehiculoId) });
      toast.success('Tarifa actualizada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeactivateTarifa(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete<ApiResponse<Tarifa>>(`/tarifas/${id}`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all(vehiculoId) });
      toast.success('Tarifa desactivada');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
