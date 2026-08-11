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

/**
 * Las cuentas corrientes, con búsqueda por cliente.
 *
 * `q` busca por **nombre, razón social, DNI y CUIT** a la vez. Es lo que hace
 * falta en el mostrador: nadie recuerda el número de cuenta de nadie — se
 * tiene el apellido, o el DNI que el cliente está dictando por teléfono.
 * El backend ignora puntos y guiones, así que el mismo CUIT encuentra escrito
 * de las dos formas.
 */
export function useCuentasCorrientes(q?: string) {
  const termino = (q ?? '').trim();
  return useQuery({
    queryKey: [KEY, termino],
    queryFn: async () => {
      const res = await api.get<{ data: CuentaCorriente[] }>('/cuentas-corrientes', {
        params: termino ? { q: termino } : undefined,
      });
      return res.data.data;
    },
    // Mantiene la lista anterior mientras llega la nueva: sin esto la tabla
    // parpadea en vacío con cada tecla y se lee como que no hay resultados.
    placeholderData: (previa) => previa,
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
