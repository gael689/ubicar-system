import { QueryClient } from '@tanstack/react-query';

/**
 * Política de caché por tipo de dato.
 *
 * **El sistema lo usan tres personas a la vez sobre los mismos datos.** Un
 * único `staleTime` global no sirve: el mismo número que evita machacar al
 * servidor con el catálogo de categorías —que cambia una vez por mes— hace que
 * Martín vea la flota como estaba hace dos minutos y entregue un auto que
 * Franco acaba de reservar.
 *
 * La diferencia que importa no es cuánto tarda en cambiar el dato, sino **qué
 * pasa si se actúa sobre una versión vieja**:
 *
 * - `COMPARTIDO`: si está viejo, se toma una decisión equivocada (reservar un
 *   auto ocupado, cobrar dos veces). Vida corta y se revalida al volver a la
 *   pestaña, que es el momento exacto en que alguien va a hacer algo con lo
 *   que tiene en pantalla.
 * - `CATALOGO`: si está viejo, en el peor caso falta una opción en un
 *   desplegable. Vive mucho.
 * - `HISTORICO`: el pasado no cambia.
 *
 * Nada de esto reemplaza al lock del backend: el caché evita mostrar datos
 * viejos, pero **la última palabra sobre si un auto está libre la tiene el
 * servidor** al momento de grabar (`ReservaService._lock_vehiculo`). Dos
 * pantallas siempre pueden mirar lo mismo en el mismo instante.
 */
export const CACHE = {
  /** Reservas, disponibilidad, caja, cuentas corrientes, notificaciones. */
  COMPARTIDO: { staleTime: 15_000, refetchOnWindowFocus: true },
  /** Categorías, adicionales, tarifas, configuración. */
  CATALOGO: { staleTime: 10 * 60_000, refetchOnWindowFocus: false },
  /** Reportes cerrados, historial de notificaciones, movimientos pasados. */
  HISTORICO: { staleTime: 30 * 60_000, refetchOnWindowFocus: false },
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // El default es el conservador: ante la duda, que el dato sea fresco.
      // Equivocarse por pedir de más cuesta una request; equivocarse por
      // mostrar de menos cuesta una entrega mal hecha.
      ...CACHE.COMPARTIDO,
      // Con 3 personas, que la pestaña de atrás se ponga al día sola evita el
      // caso más común: dejar el sistema abierto, volver, y operar sobre lo
      // que había hace media hora.
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      // Reintentar una mutación puede duplicar un cobro o una reserva. Si algo
      // falla, lo decide la persona, no el cliente HTTP.
      retry: 0,
    },
  },
});
