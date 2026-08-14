import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Reserva } from '@/types';

/**
 * Los tres pasos que le faltan a una reserva que entró por la web y todavía
 * no es una venta cerrada: **cobrar, asignar el auto y emitir el contrato**.
 *
 * Viven juntos porque en la pantalla se resuelven juntos. Una reserva web por
 * transferencia llega en `pendiente_pago`, sin auto y sin contrato, y **no se
 * confirma sola**: no hay webhook, el cliente manda el comprobante por
 * WhatsApp y alguien lo concilia contra el extracto.
 */

/** Un auto que está libre de verdad en las fechas de la reserva. */
export interface VehiculoLibre {
  id: number;
  patente: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string | null;
  estado: string;
  categoria_id: number | null;
  categoria_nombre: string | null;
  /** Los de otra categoría no se ocultan: un upgrade salva la venta. */
  es_categoria_pedida: boolean;
  /**
   * D-54 / checklist 56: `true` cuando la categoría de este vehículo es
   * INFERIOR a la pedida — hay que avisarlo antes de asignar, no enterarse
   * después. `false` para la categoría pedida, un upgrade real, o cuando no
   * hay con qué compararlo (reserva sin categoría, `orden` sin cargar).
   */
  es_downgrade: boolean;
}

export interface VehiculosDisponibles {
  categoria_id: number | null;
  categoria_nombre: string | null;
  vehiculo_actual_id: number | null;
  vehiculos: VehiculoLibre[];
}

/**
 * Los autos libres en el rango exacto de la reserva.
 *
 * No es la flota filtrada en el navegador: el backend descuenta reservas,
 * bloqueos, holds y el margen de preparación entre que un auto vuelve y se
 * puede volver a entregar. Un desplegable con los 16 autos obliga al operador
 * a saberse de memoria cuál está afuera.
 *
 * `staleTime: 0` a propósito — entre que se abre el panel y se elige el auto
 * puede entrar otra reserva, y este es el dato que no puede estar viejo.
 */
export function useVehiculosDisponibles(reservaId: number | null) {
  return useQuery({
    queryKey: ['reservas', reservaId, 'vehiculos-disponibles'],
    enabled: reservaId !== null,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await api.get<{ data: VehiculosDisponibles }>(
        `/reservas/${reservaId}/vehiculos-disponibles`,
      );
      return data.data;
    },
  });
}

export interface RegistrarCobroInput {
  id: number;
  monto: number;
  medio_pago: string;
  fecha?: string;
  /** Número de operación: es lo que después cruza el cobro con el extracto. */
  referencia?: string;
  confirmar?: boolean;
}

/**
 * La plata que ya entró, en un solo paso con la confirmación.
 *
 * Quien ve la transferencia en el extracto está confirmando la reserva, no
 * cargando un dato: separarlo en dos acciones dejaba reservas cobradas que
 * nadie confirmaba.
 */
export function useRegistrarCobro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarCobroInput) => {
      const { id, ...body } = input;
      const { data } = await api.post<{ data: Reserva }>(
        `/reservas/${id}/registrar-cobro`, body,
      );
      return data.data;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

export function useAsignarVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id, vehiculo_id, confirmar }: { id: number; vehiculo_id: number; confirmar?: boolean },
    ) => {
      const { data } = await api.post<{ data: Reserva & { puede_emitir_contrato: boolean } }>(
        `/reservas/${id}/asignar-vehiculo`, { vehiculo_id, confirmar },
      );
      return data.data;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

/**
 * Todo lo que muestra una reserva cambia cuando se cobra o se asigna: la
 * bandeja, el listado general, la ocupación del calendario y la lista de
 * autos libres. Invalidar de menos deja pantallas mintiendo.
 */
function invalidarTodo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['reservas'] });
  qc.invalidateQueries({ queryKey: ['reservas-web'] });
  qc.invalidateQueries({ queryKey: ['ocupacion'] });
  qc.invalidateQueries({ queryKey: ['pagos'] });
}
