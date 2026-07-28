import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type {
  ApiResponse,
  HistorialVehiculo,
  PaginatedResponse,
  Vehiculo,
  VehiculoCreate,
  VehiculoUpdate,
} from '@/types';

export interface VehiculoFilters {
  estado?: string;
  tipo?: string;
  q?: string;
  incluir_inactivos?: boolean;
  page?: number;
  page_size?: number;
}

const KEYS = {
  all: ['vehiculos'] as const,
  list: (params?: VehiculoFilters) => [...KEYS.all, 'list', params] as const,
  detail: (id: number) => [...KEYS.all, 'detail', id] as const,
  historial: (id: number) => [...KEYS.all, 'historial', id] as const,
};

export function useVehiculos(filters: VehiculoFilters = {}) {
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Vehiculo>>('/vehiculos', {
        params: filters,
      });
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useVehiculo(id: number | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Vehiculo>>(`/vehiculos/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useHistorialVehiculo(id: number | undefined) {
  return useQuery({
    queryKey: KEYS.historial(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<HistorialVehiculo>>(`/vehiculos/${id}/historial`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: VehiculoCreate) => {
      const { data } = await api.post<ApiResponse<Vehiculo>>('/vehiculos', body);
      return data.data;
    },
    onSuccess: (vehiculo) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success(`Vehículo ${vehiculo.patente} creado`);
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useUpdateVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: VehiculoUpdate }) => {
      const { data } = await api.patch<ApiResponse<Vehiculo>>(`/vehiculos/${id}`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success('Vehículo actualizado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

/**
 * Baja lógica. El backend devuelve 409 si el vehículo tiene reservas sin
 * cerrar — antes lo daba de baja igual, incluso con el auto circulando.
 *
 * El error no se toastea acá: quien llama necesita distinguir "no se pudo" de
 * "hay reservas y hay que confirmar", que son dos cosas distintas.
 */
export function useDeactivateVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete<ApiResponse<Vehiculo>>(`/vehiculos/${id}`);
      return data.data;
    },
    onSuccess: (vehiculo) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success(`${vehiculo.patente} dado de baja. Sigue visible en "Mostrar inactivos".`);
    },
  });
}

/**
 * La baja a sabiendas: se usa después de ver qué reservas quedan afectadas.
 * Es el camino explícito para hacer lo que el DELETE frena.
 */
export function useInactivarVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.patch<ApiResponse<Vehiculo>>(
        `/vehiculos/${id}/inactivar`, { confirmacion: true },
      );
      return data.data;
    },
    onSuccess: (vehiculo) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ['reservas'] });
      toast.success(`${vehiculo.patente} dado de baja. Revisá las reservas que quedaron afectadas.`);
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

/** Las reservas vivas de un vehículo: el dry-run antes de darlo de baja. */
export function useReservasAfectadas(id: number | undefined, enabled = false) {
  return useQuery({
    queryKey: [...KEYS.all, 'reservas-afectadas', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ reservas_afectadas: unknown[]; total: number }>>(
        `/vehiculos/${id}/reservas-afectadas`,
      );
      return data.data;
    },
    enabled: !!id && enabled,
  });
}

export function useReactivateVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<ApiResponse<Vehiculo>>(`/vehiculos/${id}/reactivar`);
      return data.data;
    },
    onSuccess: (vehiculo) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success(`${vehiculo.patente} reactivado`);
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useUploadFoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<ApiResponse<Vehiculo>>(`/vehiculos/${id}/foto`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success('Foto subida');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
