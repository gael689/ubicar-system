import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse } from '@/types';

export type TipoComprobante = 'factura_a' | 'factura_b' | 'factura_c' | 'nota_credito' | 'nota_debito' | 'remito';
export type EstadoComprobante = 'emitida' | 'anulada' | 'cobrada';

export interface Comprobante {
  id: number;
  tipo: TipoComprobante;
  punto_venta: string | null;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  cliente_id: number;
  alquiler_id: number | null;
  reserva_id: number | null;
  neto: string | null;
  iva: string | null;
  total: string;
  cae: string | null;
  cae_vencimiento: string | null;
  archivo_key: string;
  archivo_url: string | null;
  estado: EstadoComprobante;
  motivo_anulacion: string | null;
  movimiento_cc_id: number | null;
  activo: boolean;
  creado_por: number;
  created_at: string;
}

export interface ComprobanteCreateInput {
  tipo: TipoComprobante;
  punto_venta?: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento?: string;
  total: number;
  neto?: number;
  iva?: number;
  file: File;
}

const KEYS = {
  cliente: (clienteId: number) => ['comprobantes', 'cliente', clienteId] as const,
};

export function useComprobantesCliente(clienteId: number, incluirInactivos = false) {
  return useQuery({
    queryKey: [...KEYS.cliente(clienteId), { incluirInactivos }],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Comprobante[]>>(
        `/clientes/${clienteId}/comprobantes`, { params: { incluir_inactivos: incluirInactivos } }
      );
      return data.data;
    },
    enabled: !!clienteId,
  });
}

export function useCreateComprobante(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ComprobanteCreateInput) => {
      const form = new FormData();
      form.append('tipo', input.tipo);
      form.append('numero', input.numero);
      form.append('fecha_emision', input.fecha_emision);
      if (input.punto_venta) form.append('punto_venta', input.punto_venta);
      if (input.fecha_vencimiento) form.append('fecha_vencimiento', input.fecha_vencimiento);
      if (input.neto != null) form.append('neto', String(input.neto));
      if (input.iva != null) form.append('iva', String(input.iva));
      form.append('total', String(input.total));
      form.append('file', input.file);
      const { data } = await api.post<ApiResponse<Comprobante>>(
        `/clientes/${clienteId}/comprobantes`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.cliente(clienteId) });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
      toast.success('Comprobante cargado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

export function useAnularComprobante(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<ApiResponse<Comprobante>>(`/comprobantes/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.cliente(clienteId) });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
      toast.success('Comprobante anulado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
