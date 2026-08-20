import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse, Cliente, ClienteCreate, ClienteUpdate, ClienteContacto, ClienteContactoCreate } from '@/types';

export interface ConductorAdicional {
  id: number;
  cliente_id: number;
  nombre_completo: string;
  dni?: string;
  licencia_numero?: string;
  licencia_vencimiento: string;
  // La edad de quien maneja. Ya no cambia el precio (se retiró el recargo por
  // franja etaria, D-38); decide la edad mínima para alquilar (D-51), y manda
  // la del conductor designado por sobre la del titular que paga.
  fecha_nacimiento?: string | null;
  activo: boolean;
}

export interface ConductorAdicionalCreate {
  nombre_completo: string;
  dni?: string;
  licencia_numero?: string;
  licencia_vencimiento: string;
}

export interface ClienteFilters {
  q?: string;
  tipo?: string;
  frecuente?: boolean;
  incluir_inactivos?: boolean;
  page?: number;
  page_size?: number;
}

const KEYS = {
  all: ['clientes'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  list: (filters: ClienteFilters) => [...KEYS.lists(), filters] as const,
  details: () => [...KEYS.all, 'detail'] as const,
  detail: (id: number) => [...KEYS.details(), id] as const,
  conductores: (clienteId: number) => [...KEYS.all, 'conductores', clienteId] as const,
  contactos: (clienteId: number) => [...KEYS.all, 'contactos', clienteId] as const,
};

export function useClientes(filters: ClienteFilters = {}) {
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Cliente>>('/clientes', { params: filters });
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCliente(id?: number) {
  return useQuery({
    queryKey: KEYS.detail(id!),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Cliente>>(`/clientes/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ClienteCreate) => {
      const { data } = await api.post<ApiResponse<Cliente>>('/clientes', body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success('Cliente creado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: ClienteUpdate }) => {
      const { data } = await api.patch<ApiResponse<Cliente>>(`/clientes/${id}`, body);
      return data.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success('Cliente actualizado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeactivateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/clientes/${id}`);
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success('Cliente dado de baja');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useReactivateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.patch<ApiResponse<Cliente>>(`/clientes/${id}`, { activo: true });
      return data.data;
    },
    onSuccess: (cliente) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success(`${cliente.nombre_completo} reactivado`);
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useConductores(clienteId: number) {
  return useQuery({
    queryKey: KEYS.conductores(clienteId),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ConductorAdicional[]>>(
        `/clientes/${clienteId}/conductores`
      );
      return data.data;
    },
    enabled: !!clienteId,
  });
}

export function useAddConductor(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ConductorAdicionalCreate) => {
      const { data } = await api.post<ApiResponse<ConductorAdicional>>(
        `/clientes/${clienteId}/conductores`, body
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.conductores(clienteId) });
      toast.success('Conductor adicional agregado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeleteConductor(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conductorId: number) => {
      await api.delete(`/clientes/${clienteId}/conductores/${conductorId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.conductores(clienteId) });
      toast.success('Conductor eliminado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

// --- Contactos (empresas) ---

export function useContactos(clienteId: number) {
  return useQuery({
    queryKey: KEYS.contactos(clienteId),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ClienteContacto[]>>(`/clientes/${clienteId}/contactos`);
      return data.data;
    },
    enabled: !!clienteId,
  });
}

export function useAddContacto(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ClienteContactoCreate) => {
      const { data } = await api.post<ApiResponse<ClienteContacto>>(`/clientes/${clienteId}/contactos`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.contactos(clienteId) });
      toast.success('Contacto agregado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeleteContacto(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactoId: number) => {
      await api.delete(`/clientes/${clienteId}/contactos/${contactoId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.contactos(clienteId) });
      toast.success('Contacto eliminado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
