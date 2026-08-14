import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SolicitudContacto, EstadoSolicitud } from '@/types';

const KEY = 'solicitudes-contacto';

/**
 * "Piden que los llamemos" (D-61).
 *
 * Consulta aparte de `useReservasWeb` a propósito: son entidades distintas y
 * mezclarlas en un hook sería el primer paso para volver a confundirlas en la
 * pantalla, que es justo lo que esto vino a separar.
 */
export function useSolicitudesContacto(estado: EstadoSolicitud = 'pendiente') {
  return useQuery({
    queryKey: [KEY, estado],
    queryFn: async () => {
      const res = await api.get<{ data: SolicitudContacto[] }>('/solicitudes-contacto', {
        params: { estado },
      });
      return res.data.data;
    },
    // Le prometimos una llamada: el mostrador tiene que enterarse sin
    // recargar, igual que con una reserva web.
    refetchInterval: 60_000,
  });
}

export function useResumenSolicitudesContacto() {
  return useQuery({
    queryKey: [KEY, 'resumen'],
    queryFn: async () => {
      const res = await api.get<{ data: { pendientes: number } }>(
        '/solicitudes-contacto/resumen',
      );
      return res.data.data;
    },
    refetchInterval: 60_000,
  });
}

/** Ya se lo llamó, o el asunto se terminó. Los dos guardan qué pasó. */
export function useResolverSolicitudContacto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accion, resultado }: {
      id: number;
      accion: 'contactado' | 'cerrar';
      resultado?: string;
    }) => api.post<{ data: SolicitudContacto }>(
      `/solicitudes-contacto/${id}/${accion}`, { resultado },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });
}
