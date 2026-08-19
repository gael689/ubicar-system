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

/** Aviso que devuelve el backend cuando la asignación tuvo consecuencias. */
export interface AvisoAsignacion {
  tipo: 'contrato_a_regenerar' | 'contrato_anulado_por_reasignacion';
  contrato_id: number;
  mensaje: string;
}

/**
 * **El único camino para ponerle un auto a una reserva.**
 *
 * Había otros dos y las tres implementaciones habían derivado: sólo ésta toma
 * el lock del vehículo, registra el upgrade/downgrade de D-54, deja auditoría
 * y resuelve el contrato viejo. `POST /reservas-web/{id}/aceptar` se borró el
 * 19/08 por eso.
 *
 * `vehiculo_actual` es concurrencia optimista: **si no se manda, no se
 * chequea nada**, así que mandarlo siempre desde las pantallas que muestran
 * un auto ya asignado.
 */
export function useAsignarVehiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id, vehiculo_id, confirmar, vehiculo_actual }: {
        id: number; vehiculo_id: number; confirmar?: boolean;
        vehiculo_actual?: number | null;
      },
    ) => {
      const body: Record<string, unknown> = { vehiculo_id, confirmar };
      // Sólo va si el llamador lo pasó: `null` significa "esperaba que no
      // tuviera auto", que es distinto de "no lo chequees".
      if (vehiculo_actual !== undefined) body.vehiculo_actual = vehiculo_actual;
      const { data } = await api.post<{
        data: Reserva & { puede_emitir_contrato: boolean; warnings?: AvisoAsignacion[] };
      }>(`/reservas/${id}/asignar-vehiculo`, body);
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
  // La campana también: `resolver_por_entidad` da por resuelta la
  // notificación de la reserva web, y sin esto el badge seguía contándola
  // hasta el siguiente poll de 60 s.
  qc.invalidateQueries({ queryKey: ['notificaciones'] });
}
