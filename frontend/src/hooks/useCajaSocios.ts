import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Socio {
  id: number;
  nombre: string;
  porcentaje: number;
  usuario_id: number | null;
  activo: boolean;
}

export interface FilaAlquiler {
  reserva_id: number;
  patente: string | null;
  cliente: string | null;
  retiro_fecha: string;
  retiro_hora: string;
  devolucion_fecha: string;
  devolucion_hora: string;
  dias: number;
  precio_dia: number | null;
  facturado: number;
  caja: number;
  total: number;
  tipo: string;
  estado: string;
  medios: string[];
  cobrado: boolean;
  cobrado_monto: number;
  saldo: number;
  fecha_cobro: string | null;
  cobro_socios: string[];
  cobro_sin_socio: boolean;
  repartido: boolean;
  distribuible: number;
}

export interface FiltroAlquileres {
  desde?: string;
  hasta?: string;
  q?: string;
  cobrado?: boolean;
}

export interface ACobrar {
  total_pendiente: number;
  cantidad: number;
  por_medio: Record<string, number>;
  items: {
    reserva_id: number; cliente: string | null; patente: string | null;
    retiro_fecha: string; devolucion_fecha: string; total: number; saldo: number;
    medio_previsto: string; dias_desde_devolucion: number;
  }[];
}

export interface MesDeCaja {
  mes: string;
  socios: { id: number; nombre: string; porcentaje: number; usuario_id: number | null }[];
  medios: string[];
  por_medio: Record<string, Record<string, number>>;
  total_cobrado: number;
  cobrado_por_socio: Record<string, number>;
  sin_socio: number;
  distribuible: number;
  parte_por_socio: Record<string, number>;
  compensacion: {
    total_cobrado: number;
    corresponde: Record<string, number>;
    saldo: Record<string, number>;
    transferencias: { de: number; a: number; de_nombre: string; a_nombre: string; monto: number }[];
  } | null;
  gastos: { total: number; cantidad: number };
  cobros: { id: number; fecha: string; monto: number; medio: string; socio_id: number | null; reserva_id: number | null; repartido: boolean }[];
  reparto: { id: number; fecha: string; transferencias: unknown[] } | null;
}

export interface Propios {
  entra: number;
  sale: number;
  saldo: number;
  items: { id: number; fecha: string; concepto: string; tipo: 'entra' | 'sale'; monto: number; medio: string | null; notas: string | null }[];
}

const KEY = 'caja-socios';

export function useSocios() {
  return useQuery({
    queryKey: [KEY, 'socios'],
    queryFn: async () => (await api.get<{ data: Socio[] }>('/caja/socios')).data.data,
  });
}

export function useGuardarSocios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (socios: { id: number; porcentaje: number; usuario_id?: number | null }[]) =>
      api.put('/caja/socios', { socios }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useAlquileresDeCaja(filtro: FiltroAlquileres, pagina = 1) {
  return useQuery({
    queryKey: [KEY, 'alquileres', filtro, pagina],
    queryFn: async () =>
      (await api.get<{ data: { items: FilaAlquiler[]; total: number } }>('/caja/alquileres', {
        params: { ...filtro, pagina, por_pagina: 200 },
      })).data.data,
    placeholderData: prev => prev,
  });
}

export function useCambiarFacturado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reservaId, monto }: { reservaId: number; monto: number | null }) =>
      api.patch(`/caja/alquileres/${reservaId}/facturado`, { monto_facturado: monto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useACobrar() {
  return useQuery({
    queryKey: [KEY, 'a-cobrar'],
    queryFn: async () => (await api.get<{ data: ACobrar }>('/caja/a-cobrar')).data.data,
  });
}

export function useMesDeCaja(mes: string) {
  return useQuery({
    queryKey: [KEY, 'mes', mes],
    queryFn: async () => (await api.get<{ data: MesDeCaja }>('/caja/mes', { params: { mes } })).data.data,
  });
}

export function useRepartirMes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { mes: string; notas?: string }) => api.post('/caja/mes/repartir', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useAnularReparto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/caja/repartos/${id}/anular`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useSocioDelPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pagoId, socioId }: { pagoId: number; socioId: number | null }) =>
      api.patch(`/caja/pagos/${pagoId}/socio`, { socio_id: socioId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePropios(desde?: string, hasta?: string) {
  return useQuery({
    queryKey: [KEY, 'propios', desde, hasta],
    queryFn: async () => (await api.get<{ data: Propios }>('/caja/propios', { params: { desde, hasta } })).data.data,
  });
}

export function useAnotarPropio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { fecha: string; concepto: string; tipo: 'entra' | 'sale'; monto: number; medio?: string }) =>
      api.post('/caja/propios', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'propios'] }),
  });
}

export function useAnularPropio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/caja/propios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'propios'] }),
  });
}

/** Baja la planilla en CSV (se abre en Excel). */
export async function exportarAlquileres(desde?: string, hasta?: string) {
  const res = await api.get('/caja/alquileres/exportar', { params: { desde, hasta }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'caja-alquileres.csv';
  a.click();
  URL.revokeObjectURL(url);
}
