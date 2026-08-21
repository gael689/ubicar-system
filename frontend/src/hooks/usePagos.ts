import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Pago, PagoCreate, CajaData, MetodoPago, MovimientoCaja, MovimientoCajaCreate } from '@/types';

const KEY = 'pagos';

export interface FiltrosCobros {
  alquiler_id?: number;
  cliente_id?: number;
  /** Uno o varios medios; vacío = todos. */
  medio_pago?: MetodoPago[];
  con_factura?: boolean;
  cobrado_por?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  monto_min?: number;
  monto_max?: number;
  page?: number;
  page_size?: number;
}

/** Lo que entró, desglosado por medio. Lo calcula el backend sobre el filtro
 *  completo — no sobre la página — así que cerrar la caja no depende de sumar
 *  a mano lo que se ve en pantalla. */
export interface ResumenCobros {
  total: number;
  cantidad: number;
  por_medio: Record<MetodoPago, number>;
}

export function usePagos(filtros: FiltrosCobros = {}) {
  return useQuery({
    queryKey: [KEY, filtros],
    queryFn: async () => {
      const p = new URLSearchParams();
      const { medio_pago, ...resto } = filtros;
      Object.entries(resto).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== null) p.set(k, String(v));
      });
      if (medio_pago?.length) p.set('medio_pago', medio_pago.join(','));

      const res = await api.get<{
        data: Pago[]; total: number; resumen: ResumenCobros;
      }>(`/pagos?${p}`);
      // El backend envuelve todo en { data, total, ... }: devolver `res.data`
      // pelado entregaría el sobre en vez del contenido.
      return res.data;
    },
    // Al cambiar un filtro se mantiene la tabla anterior en pantalla en vez de
    // vaciarla: el salto a cero y vuelta se lee como si se hubiera roto algo.
    placeholderData: keepPreviousData,
  });
}

export function usePagosPendientes() {
  return useQuery({
    queryKey: ['pagos', 'pendientes'],
    queryFn: async () => {
      const res = await api.get<{ data: any[] }>('/pagos/pendientes');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCajaDia(fecha: string) {
  return useQuery({
    queryKey: ['caja', 'dia', fecha],
    queryFn: async () => {
      const res = await api.get<{ data: CajaData }>(`/pagos/caja/dia?fecha=${fecha}`);
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

/**
 * Registra un movimiento de caja: un depósito al banco, un retiro, una
 * garantía en efectivo que entra o vuelve.
 *
 * El depósito y el retiro son **los dos únicos datos que ningún evento del
 * sistema dispara solo**: los tiene que cargar una persona. Por eso la caja
 * del día muestra el efectivo acumulado con la fecha del último depósito — si
 * nadie los carga, el número queda alto y viejo, y eso se ve.
 */
export function useCrearMovimientoCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MovimientoCajaCreate) =>
      api.post<{ data: MovimientoCaja }>('/pagos/caja/movimientos', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

export function useAnularMovimientoCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post(`/pagos/caja/movimientos/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

export function useCrearPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PagoCreate) => api.post<Pago>('/pagos', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
    },
  });
}

/**
 * Da de baja un cobro. **No lo borra.**
 *
 * El endpoint viejo (`DELETE /pagos/{id}`) era el único borrado físico del
 * sistema: sacaba plata de la caja de cualquier fecha pasada sin dejar nada que
 * contara qué había. Ahora el cobro queda marcado `anulado`, con motivo y
 * autor, y su crédito en la cuenta corriente se revierte con un contra-asiento.
 */
export function useAnularPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post(`/pagos/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['cuentas-corrientes'] });
    },
  });
}

export function useEliminarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/pagos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['caja'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
    },
  });
}
