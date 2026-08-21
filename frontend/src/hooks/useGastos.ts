import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractError } from '@/lib/utils';
import type { PaginatedResponse, ApiResponse } from '@/types';

export type TipoGasto =
  | 'service' | 'combustible' | 'cubiertas' | 'reparacion'
  | 'seguro' | 'patente' | 'vtv' | 'lavado' | 'otro';

export type MedioPagoGasto = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'echeq';

export interface Gasto {
  id: number;
  vehiculo_id: number;
  tipo: TipoGasto;
  descripcion: string;
  monto: number;
  medio_pago: MedioPagoGasto;
  fecha: string;
  proveedor: string | null;
  km_al_momento: number | null;
  notas: string | null;
}

export interface GastoCreate {
  tipo: TipoGasto;
  descripcion: string;
  monto: number;
  medio_pago: MedioPagoGasto;
  fecha: string;
  proveedor?: string | null;
  km_al_momento?: number | null;
  notas?: string | null;
}

export interface GastoFilters {
  tipo?: TipoGasto;
  fecha_desde?: string;
  fecha_hasta?: string;
  page?: number;
  page_size?: number;
}

const KEYS = {
  all: (vehiculoId: number) => ['gastos', vehiculoId] as const,
  list: (vehiculoId: number, filters?: GastoFilters) =>
    [...KEYS.all(vehiculoId), 'list', filters] as const,
};

export function useGastos(vehiculoId: number, filters: GastoFilters = {}) {
  return useQuery({
    queryKey: KEYS.list(vehiculoId, filters),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Gasto>>(
        `/vehiculos/${vehiculoId}/gastos`, { params: filters }
      );
      return data;
    },
    enabled: !!vehiculoId,
    placeholderData: (prev) => prev,
  });
}

export function useCreateGasto(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: GastoCreate) => {
      const { data } = await api.post<ApiResponse<Gasto>>(
        `/vehiculos/${vehiculoId}/gastos`, body
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all(vehiculoId) });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      toast.success('Gasto registrado');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}

/**
 * Da de baja un gasto. **No lo borra.**
 *
 * Los gastos son la mitad de "cuánto se gasta en la flota" y restan del
 * efectivo del cajón. Borrar uno cambiaba los dos números hacia atrás sin dejar
 * nada. El motivo es obligatorio.
 */
export function useDeleteGasto(vehiculoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) => {
      await api.post(`/gastos/${id}/anular`, { motivo });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all(vehiculoId) });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      toast.success('Gasto dado de baja');
    },
    onError: (err) => toast.error(extractError(err)),
  });
}
