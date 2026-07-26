import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse } from '@/types';

export interface Documento {
  id: number;
  vehiculo_id: number;
  tipo: 'poliza' | 'vtv' | 'clausulas' | 'otro';
  nombre: string;
  archivo_url: string | null;
  fecha_carga: string;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  cargado_por: number;
}

export interface DocumentoCreateInput {
  tipo: Documento['tipo'];
  nombre: string;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  file: File;
}

const KEYS = {
  vehiculo: (vehiculoId: number) => ['documentos', 'vehiculo', vehiculoId] as const,
  cliente: (clienteId: number) => ['documentos', 'cliente', clienteId] as const,
  // legacy alias
  all: (vehiculoId: number) => ['documentos', 'vehiculo', vehiculoId] as const,
};

export function useDocumentos(vehiculoId: number, tipo?: Documento['tipo']) {
  return useQuery({
    queryKey: [...KEYS.vehiculo(vehiculoId), { tipo }],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (tipo) params.tipo = tipo;
      const { data } = await api.get<ApiResponse<Documento[]>>(
        `/vehiculos/${vehiculoId}/documentos`, { params }
      );
      return data.data;
    },
    enabled: !!vehiculoId,
  });
}

export function useDocumentosCliente(clienteId: number, tipo?: Documento['tipo']) {
  return useQuery({
    queryKey: [...KEYS.cliente(clienteId), { tipo }],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (tipo) params.tipo = tipo;
      const { data } = await api.get<ApiResponse<Documento[]>>(
        `/clientes/${clienteId}/documentos`, { params }
      );
      return data.data;
    },
    enabled: !!clienteId,
  });
}

export function useCreateDocumento(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DocumentoCreateInput) => {
      const form = new FormData();
      form.append('tipo', input.tipo);
      form.append('nombre', input.nombre);
      if (input.vigencia_desde) form.append('vigencia_desde', input.vigencia_desde);
      if (input.vigencia_hasta) form.append('vigencia_hasta', input.vigencia_hasta);
      form.append('file', input.file);
      const { data } = await api.post<ApiResponse<Documento>>(
        `/vehiculos/${vehiculoId}/documentos`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.vehiculo(vehiculoId) });
      toast.success('Documento cargado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useCreateDocumentoCliente(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DocumentoCreateInput) => {
      const form = new FormData();
      form.append('tipo', input.tipo);
      form.append('nombre', input.nombre);
      if (input.vigencia_desde) form.append('vigencia_desde', input.vigencia_desde);
      if (input.vigencia_hasta) form.append('vigencia_hasta', input.vigencia_hasta);
      form.append('file', input.file);
      const { data } = await api.post<ApiResponse<Documento>>(
        `/clientes/${clienteId}/documentos`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.cliente(clienteId) });
      toast.success('Documento cargado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeleteDocumento(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/documentos/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.vehiculo(vehiculoId) });
      toast.success('Documento eliminado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useDeleteDocumentoCliente(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/documentos/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.cliente(clienteId) });
      toast.success('Documento eliminado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
