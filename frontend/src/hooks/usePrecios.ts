import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CACHE } from '@/lib/queryClient';
import type {
  CalcularPrecioRequest,
  CalendarioPrecios,
  Canal,
  Cotizacion,
  DescuentoDuracion,
  DescuentoDuracionCreate,
  DescuentoDuracionUpdate,
  SimulacionRegla,
  SimularReglaRequest,
  TarifaCalendario,
  TarifaCalendarioCreate,
  TarifaCalendarioUpdate,
} from '@/types';

const KEY = 'precios';

/**
 * Motor de precios por calendario (Fase 5, ítem 57).
 *
 * Todo lo que muestre un precio en el sistema debería pasar por acá: el
 * backend es la única fuente de precios, y resolver las prioridades en el
 * frontend crearía un segundo motor que tarde o temprano difiere del real.
 */

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

// ─── Cotización ───────────────────────────────────────────────────────────────

/**
 * Cotiza un rango. Se desactiva sola si falta algún dato, para no disparar
 * requests a medio completar mientras el usuario carga el formulario.
 */
export function useCalcularPrecio(payload: CalcularPrecioRequest | null) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, 'calcular', payload],
    enabled: Boolean(
      payload?.fecha_inicio &&
      payload?.fecha_fin &&
      payload.fecha_fin > payload.fecha_inicio &&
      (payload.categoria_id || payload.vehiculo_id)
    ),
    queryFn: async () => {
      const res = await api.post<{ data: Cotizacion }>('/precios/calcular', payload);
      return res.data.data;
    },
  });
}

// ─── Grilla del calendario ────────────────────────────────────────────────────

export function useCalendarioPrecios(params: {
  desde: string;
  hasta: string;
  canal?: Canal;
}) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, 'calendario', params],
    queryFn: async () => {
      const qs = new URLSearchParams({ desde: params.desde, hasta: params.hasta });
      if (params.canal) qs.set('canal', params.canal);
      const res = await api.get<{ data: CalendarioPrecios }>(`/precios/calendario?${qs}`);
      return res.data.data;
    },
  });
}

/**
 * Simula una regla que todavía no existe: cuántos días son, cuánto sale el
 * rango, qué descuento por duración le toca y si algo la pisa.
 *
 * Es lo que le pone números a la selección del calendario mientras se arrastra.
 * Va al backend a propósito — el descuento por duración y el desempate de
 * prioridades tienen una sola implementación, y no está acá.
 */
export function useSimularRegla(payload: SimularReglaRequest | null) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, 'simular', payload],
    enabled: Boolean(payload && Number(payload.precio_dia) > 0),
    queryFn: async () => {
      const res = await api.post<{ data: SimulacionRegla }>('/precios/simular', payload);
      return res.data.data;
    },
  });
}

// ─── Reglas ───────────────────────────────────────────────────────────────────

export function useReglasPrecio(params?: {
  categoria_id?: number;
  vehiculo_id?: number;
  solo_promociones?: boolean;
  vigentes_al?: string;
  incluir_inactivas?: boolean;
  /** 'web' | 'mostrador'. Trae también las de canal 'ambos', que rigen en los dos. */
  canal?: string;
}) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, 'reglas', params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.categoria_id) qs.set('categoria_id', String(params.categoria_id));
      if (params?.vehiculo_id) qs.set('vehiculo_id', String(params.vehiculo_id));
      if (params?.solo_promociones) qs.set('solo_promociones', 'true');
      if (params?.vigentes_al) qs.set('vigentes_al', params.vigentes_al);
      if (params?.incluir_inactivas) qs.set('incluir_inactivas', 'true');
      if (params?.canal) qs.set('canal', params.canal);
      const res = await api.get<{ data: TarifaCalendario[] }>(`/precios/reglas?${qs}`);
      return res.data.data;
    },
  });
}

export function useCrearReglaPrecio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: TarifaCalendarioCreate) =>
      api.post<{ data: TarifaCalendario }>('/precios/reglas', payload),
    onSuccess: invalidar,
  });
}

export function useActualizarReglaPrecio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TarifaCalendarioUpdate }) =>
      api.patch<{ data: TarifaCalendario }>(`/precios/reglas/${id}`, payload),
    onSuccess: invalidar,
  });
}

/** Baja lógica: el precio de menor prioridad vuelve a aplicar solo. */
export function useDarDeBajaReglaPrecio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/precios/reglas/${id}`),
    onSuccess: invalidar,
  });
}

export function useReactivarReglaPrecio() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.post(`/precios/reglas/${id}/reactivar`),
    onSuccess: invalidar,
  });
}

// ─── Descuentos por duración ──────────────────────────────────────────────────

export function useDescuentosDuracion(incluirInactivos = false) {
  return useQuery({
    ...CACHE.CATALOGO,
    queryKey: [KEY, 'descuentos', incluirInactivos],
    queryFn: async () => {
      const qs = incluirInactivos ? '?incluir_inactivos=true' : '';
      const res = await api.get<{ data: DescuentoDuracion[] }>(`/precios/descuentos${qs}`);
      return res.data.data;
    },
  });
}

export function useCrearDescuentoDuracion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: DescuentoDuracionCreate) =>
      api.post<{ data: DescuentoDuracion }>('/precios/descuentos', payload),
    onSuccess: invalidar,
  });
}

export function useActualizarDescuentoDuracion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: DescuentoDuracionUpdate }) =>
      api.patch<{ data: DescuentoDuracion }>(`/precios/descuentos/${id}`, payload),
    onSuccess: invalidar,
  });
}

export function useDarDeBajaDescuentoDuracion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/precios/descuentos/${id}`),
    onSuccess: invalidar,
  });
}

export function useReactivarDescuentoDuracion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => api.post(`/precios/descuentos/${id}/reactivar`),
    onSuccess: invalidar,
  });
}
