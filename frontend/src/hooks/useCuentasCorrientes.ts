import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CuentaCorriente, MovimientoCC, MovimientoCCCreate } from '@/types';

const KEY = 'cuentas-corrientes';

export function useClientesConPagoPendiente() {
  return useQuery({
    queryKey: [KEY, 'pendientes'],
    queryFn: async () => {
      const res = await api.get<{ data: number[] }>('/cuentas-corrientes/pendientes');
      return res.data.data;
    },
    staleTime: 60_000,
  });
}

export function useCuentasCorrientes() {
  return useQuery({
    queryKey: [KEY],
    queryFn: async () => {
      const res = await api.get<{ data: CuentaCorriente[] }>('/cuentas-corrientes');
      return res.data.data;
    },
  });
}

export function useCuentaCorrienteCliente(clienteId: number | undefined) {
  return useQuery({
    queryKey: [KEY, 'cliente', clienteId],
    queryFn: async () => {
      const res = await api.get<{ data: CuentaCorriente }>(`/cuentas-corrientes/cliente/${clienteId}`);
      return res.data.data;
    },
    enabled: !!clienteId,
  });
}

export function useMovimientosCC(ccId: number | undefined) {
  return useQuery({
    queryKey: [KEY, 'movimientos', ccId],
    queryFn: async () => {
      const res = await api.get<{ data: MovimientoCC[] }>(`/cuentas-corrientes/${ccId}/movimientos`);
      return res.data.data;
    },
    enabled: !!ccId,
  });
}

export function useAgregarMovimiento(ccId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MovimientoCCCreate) =>
      api.post<MovimientoCC>(`/cuentas-corrientes/${ccId}/movimientos`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useEditarVencimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ movimientoId, ...payload }: { movimientoId: number; fecha_vencimiento: string | null; motivo: string; condicion?: string | null }) =>
      api.patch<{ data: MovimientoCC }>(`/cuentas-corrientes/movimientos/${movimientoId}/vencimiento`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}
