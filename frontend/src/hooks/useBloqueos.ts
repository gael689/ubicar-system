import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  BloqueoVehiculo, BloqueoVehiculoCreate, BloqueoVehiculoUpdate, ReservaEnConflicto,
} from '@/types';

const KEY = 'bloqueos';

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [KEY] });
    // Un bloqueo cambia qué se puede reservar: la ocupación y las reservas
    // dejan de ser válidas apenas se crea o se libera uno.
    qc.invalidateQueries({ queryKey: ['ocupacion'] });
    qc.invalidateQueries({ queryKey: ['reservas'] });
  };
}

export function useBloqueos(params?: {
  vehiculo_id?: number;
  desde?: string;
  hasta?: string;
  motivo?: string;
  incluir_inactivos?: boolean;
}) {
  return useQuery({
    queryKey: [KEY, params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.vehiculo_id) qs.set('vehiculo_id', String(params.vehiculo_id));
      if (params?.desde) qs.set('desde', params.desde);
      if (params?.hasta) qs.set('hasta', params.hasta);
      if (params?.motivo) qs.set('motivo', params.motivo);
      if (params?.incluir_inactivos) qs.set('incluir_inactivos', 'true');
      const res = await api.get<{ data: BloqueoVehiculo[] }>(`/bloqueos?${qs}`);
      return res.data.data;
    },
  });
}

/**
 * Qué reservas se verían afectadas por un bloqueo, ANTES de crearlo.
 * Permite avisar en el formulario en vez de después del hecho.
 */
export function useVerificarBloqueo(params: {
  vehiculo_id?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
} | null) {
  return useQuery({
    queryKey: [KEY, 'verificar', params],
    enabled: Boolean(
      params?.vehiculo_id && params?.fecha_desde && params?.fecha_hasta &&
      params.fecha_hasta >= params.fecha_desde
    ),
    queryFn: async () => {
      const qs = new URLSearchParams({
        vehiculo_id: String(params!.vehiculo_id),
        fecha_desde: params!.fecha_desde!,
        fecha_hasta: params!.fecha_hasta!,
      });
      const res = await api.get<{ data: ReservaEnConflicto[] }>(`/bloqueos/verificar?${qs}`);
      return res.data.data;
    },
  });
}

export function useCrearBloqueo() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (payload: BloqueoVehiculoCreate) => {
      const res = await api.post<{ data: BloqueoVehiculo; message: string }>('/bloqueos', payload);
      return res.data;
    },
    onSuccess: invalidar,
  });
}

export function useActualizarBloqueo() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: BloqueoVehiculoUpdate }) =>
      api.patch<{ data: BloqueoVehiculo }>(`/bloqueos/${id}`, payload),
    onSuccess: invalidar,
  });
}

/** Baja lógica: libera el vehículo pero deja el registro en su historial. */
export function useLiberarBloqueo() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/bloqueos/${id}`),
    onSuccess: invalidar,
  });
}

export function useReactivarBloqueo() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.post(`/bloqueos/${id}/reactivar`),
    onSuccess: invalidar,
  });
}
