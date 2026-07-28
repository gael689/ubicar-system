import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Reserva, EstadoReserva } from '@/types';

const KEY = 'reservas-web';

export interface ResumenBandeja {
  por_estado: Record<string, number>;
  /** Lo que requiere que alguien haga algo. No incluye `pendiente_pago`:
   *  ese espera al cliente, no a nosotros. */
  pendientes: number;
}

export function useReservasWeb(estado?: EstadoReserva, incluirResueltas = false) {
  return useQuery({
    queryKey: [KEY, estado ?? 'bandeja', incluirResueltas],
    queryFn: async () => {
      const res = await api.get<{ data: Reserva[] }>('/reservas-web', {
        params: { estado, incluir_resueltas: incluirResueltas },
      });
      return res.data.data;
    },
  });
}

export function useResumenReservasWeb() {
  return useQuery({
    queryKey: [KEY, 'resumen'],
    queryFn: async () => {
      const res = await api.get<{ data: ResumenBandeja }>('/reservas-web/resumen');
      return res.data.data;
    },
    // La bandeja tiene que enterarse de una reserva nueva sin recargar: es
    // una venta esperando respuesta.
    refetchInterval: 60_000,
  });
}

/** Aceptar es asignar un auto concreto: una categoría no se puede entregar. */
export function useAceptarReservaWeb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, vehiculo_id, notas }: { id: number; vehiculo_id: number; notas?: string }) =>
      api.post<{ data: Reserva }>(`/reservas-web/${id}/aceptar`, { vehiculo_id, notas }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
      qc.invalidateQueries({ queryKey: ['ocupacion'] });
    },
  });
}

export function useRechazarReservaWeb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<{ data: Reserva }>(`/reservas-web/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });
}
