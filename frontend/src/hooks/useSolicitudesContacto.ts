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
export function useSolicitudesContacto(
  estado: EstadoSolicitud = 'pendiente',
  habilitada = true,
) {
  return useQuery({
    queryKey: [KEY, estado],
    queryFn: async () => {
      const res = await api.get<{ data: SolicitudContacto[] }>('/solicitudes-contacto', {
        params: { estado },
      });
      return res.data.data;
    },
    // `habilitada` existe por el historial. Las ya atendidas son dos estados
    // más (`contactado` y `cerrado`), o sea dos consultas más en cada carga de
    // la bandeja y otras dos cada 60 segundos — para una lista que la mayoría
    // de las veces nadie abre. Se piden recién cuando alguien las pide.
    enabled: habilitada,
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
