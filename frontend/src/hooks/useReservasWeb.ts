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

// Acá había un `useAceptarReservaWeb` que pegaba a `POST
// /reservas-web/{id}/aceptar`. **No lo llamaba nadie** y el endpoint asignaba
// el auto a mano, sin lock, sin la lógica de upgrade de D-54, sin auditoría y
// sin tocar el contrato. Los dos se borraron el 19/08.
//
// Asignar va por `useAsignarVehiculo` (hooks/useResolverReserva), que es el
// único camino con esa lógica.

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

/**
 * Lo que requiere que alguien haga algo, sin ventana de fechas.
 *
 * Alimenta el aviso permanente del layout. Es una lista y no un contador
 * porque el aviso muestra **cuál** es la más urgente sin que haya que
 * abrirlo: "2 reservas sin auto" no dice nada, "Gael González, sedán, sale el
 * 3" sí.
 *
 * `refetchInterval` de 30 s y no de 60 como el resto: acá el costo de
 * enterarse tarde es un auto comprometido que nadie asignó, y el de enterarse
 * de más es una consulta que devuelve una lista de tres filas.
 */
export function useReservasPendientes() {
  return useQuery({
    queryKey: ['reservas-web', 'pendientes'],
    queryFn: async () => {
      const res = await api.get<{ data: Reserva[] }>('/reservas-web/pendientes');
      return res.data.data;
    },
    refetchInterval: 30_000,
    // Que vuelva del navegador a la pestaña sea suficiente para actualizarlo:
    // el caso típico es dejar el sistema abierto y volver un rato después.
    refetchOnWindowFocus: true,
  });
}
