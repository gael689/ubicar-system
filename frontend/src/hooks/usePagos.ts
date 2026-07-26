import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Pago, PagoCreate, CajaData } from '@/types';

const KEY = 'pagos';

export function usePagos(alquiler_id?: number, fecha_desde?: string, fecha_hasta?: string) {
  return useQuery({
    queryKey: [KEY, { alquiler_id, fecha_desde, fecha_hasta }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (alquiler_id) params.set('alquiler_id', String(alquiler_id));
      if (fecha_desde) params.set('fecha_desde', fecha_desde);
      if (fecha_hasta) params.set('fecha_hasta', fecha_hasta);
      const res = await api.get<Pago[]>(`/pagos?${params}`);
      return res.data;
    },
  });
}

export function usePagosPendientes() {
  return useQuery({
    queryKey: ['pagos', 'pendientes'],
    queryFn: async () => {
      const res = await api.get<{ data: any[] }>('/pagos/pendientes');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCajaDia(fecha: string) {
  return useQuery({
    queryKey: ['caja', 'dia', fecha],
    queryFn: async () => {
      const res = await api.get<{ data: CajaData }>(`/pagos/caja/dia?fecha=${fecha}`);
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCrearPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PagoCreate) => api.post<Pago>('/pagos', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
    },
  });
}

export function useEliminarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/pagos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
    },
  });
}
