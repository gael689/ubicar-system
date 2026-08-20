import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { ApiResponse } from '@/types';

const KEY = 'presupuestos';

export interface Presupuesto {
  id: number;
  /** `null` = cotización huérfana: se cotizó a alguien que todavía no es cliente. */
  cliente_id: number | null;
  vehiculo_id: number | null;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  tarifa_unitaria: number;
  descuento: number;
  total: number;
  estado: 'borrador' | 'enviado' | 'aceptado' | 'vencido';
  notas: string | null;
  created_by: number;
  created_at: string;
}

/** Las cotizaciones de un cliente, para su solapa de Historial. */
export function usePresupuestosDeCliente(clienteId: number) {
  return useQuery({
    queryKey: [KEY, 'cliente', clienteId],
    enabled: clienteId > 0,
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Presupuesto[]>>('/cotizador/presupuestos', {
        params: { cliente_id: clienteId },
      });
      return data.data;
    },
  });
}

/**
 * Las cotizaciones sin dueño.
 *
 * Existen porque crear un cliente por cada consulta ensucia la base con gente
 * que nunca alquiló, pero sin cliente el presupuesto no deja rastro en ningún
 * lado. Se guardan sueltas y se les asigna dueño cuando esa persona vuelve.
 */
export function usePresupuestosHuerfanos() {
  return useQuery({
    queryKey: [KEY, 'huerfanas'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Presupuesto[]>>('/cotizador/presupuestos', {
        params: { huerfanas: true },
      });
      return data.data;
    },
  });
}

export function useAsignarClienteAPresupuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clienteId }: { id: number; clienteId: number }) => {
      const { data } = await api.patch<ApiResponse<Presupuesto>>(
        `/cotizador/presupuestos/${id}/cliente`,
        { cliente_id: clienteId },
      );
      return data.data;
    },
    onSuccess: () => {
      // Se invalida el prefijo entero: la cotización sale de "huérfanas" y
      // entra al historial de un cliente, así que las dos listas cambian.
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Cotización asignada al cliente');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
