import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { ApiResponse, Servicio, ServicioCreate, ServicioUpdate } from '@/types';

const KEY = (vehiculoId: number) => ['servicios', vehiculoId] as const;

export function useServicios(vehiculoId: number) {
  return useQuery({
    queryKey: KEY(vehiculoId),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Servicio[]>>(`/vehiculos/${vehiculoId}/servicios`);
      return data.data;
    },
    enabled: !!vehiculoId,
  });
}

export function useCrearServicio(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ServicioCreate) => {
      const { data } = await api.post<ApiResponse<Servicio>>(`/vehiculos/${vehiculoId}/servicios`, payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(vehiculoId) });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
      toast.success('Servicio registrado');
    },
    onError: () => toast.error('Error al registrar el servicio'),
  });
}

export function useActualizarServicio(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ServicioUpdate }) => {
      const { data } = await api.patch<ApiResponse<Servicio>>(`/servicios/${id}`, payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(vehiculoId) });
      toast.success('Servicio actualizado');
    },
    onError: () => toast.error('Error al actualizar el servicio'),
  });
}

export function useEliminarServicio(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/servicios/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(vehiculoId) });
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
      toast.success('Servicio eliminado');
    },
    onError: () => toast.error('Error al eliminar el servicio'),
  });
}
