import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { CACHE } from '@/lib/queryClient';
import type { ApiResponse, DisponibilidadInterna, VehiculosLibres } from '@/types';

const KEY = 'disponibilidad';

/**
 * Cupo por categoría para un rango, con el criterio del mostrador.
 *
 * **El mismo cálculo que la web, sin las puertas de la web.** El endpoint
 * público valida ventana comercial, edad mínima y tiene rate limit por IP:
 * nada de eso aplica cuando hay alguien atendiendo. `/disponibilidad/interna`
 * llama al mismo `DisponibilidadService` sin esas tres cosas — es el mismo
 * cupo, no una segunda cuenta.
 *
 * Va con `COMPARTIDO`: el cupo es exactamente el dato sobre el que actuar con
 * una versión vieja termina en una sobreventa.
 */
export function useDisponibilidadInterna(params: {
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio?: string;
  hora_fin?: string;
} | null) {
  return useQuery({
    ...CACHE.COMPARTIDO,
    queryKey: [KEY, 'interna', params],
    enabled: Boolean(
      params?.fecha_inicio && params?.fecha_fin && params.fecha_fin > params.fecha_inicio
    ),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DisponibilidadInterna>>(
        '/disponibilidad/interna',
        { params },
      );
      return data.data;
    },
  });
}

/**
 * Los autos libres de verdad en un rango, **sin necesitar una reserva
 * guardada**.
 *
 * `/reservas/{id}/vehiculos-disponibles` hace lo mismo pero pide un id, y al
 * crear una reserva ese id todavía no existe. Sin esto el formulario ofrecía
 * la flota entera y el conflicto aparecía recién después de guardar.
 */
export function useVehiculosLibres(params: {
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio?: string;
  hora_fin?: string;
  categoria_id?: number | null;
  excluir_reserva_id?: number | null;
} | null) {
  return useQuery({
    ...CACHE.COMPARTIDO,
    queryKey: [KEY, 'vehiculos', params],
    enabled: Boolean(
      params?.fecha_inicio && params?.fecha_fin && params.fecha_fin > params.fecha_inicio
    ),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<VehiculosLibres>>(
        '/disponibilidad/vehiculos',
        {
          params: {
            ...params,
            categoria_id: params?.categoria_id ?? undefined,
            excluir_reserva_id: params?.excluir_reserva_id ?? undefined,
          },
        },
      );
      return data.data;
    },
  });
}
