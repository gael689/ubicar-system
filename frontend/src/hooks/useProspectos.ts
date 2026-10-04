import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface FiltroProspectos {
  q?: string;
  segmento?: string;
  ciudad?: string;
  estado?: string;
  con_mail?: boolean;
  con_telefono?: boolean;
  score_min?: number;
  contacto_previo?: boolean;
  solo_contactables?: boolean;
}

export interface Prospecto {
  id: number;
  nombre: string;
  segmento: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  score: number | null;
  estado: string;
  es_cliente: boolean;
  ya_cliente_id: number | null;
  ya_cliente_nombre: string | null;
  cruce_por: 'email' | 'telefono' | 'dominio' | 'nombre' | null;
  cruce_descartado: boolean;
  contacto_previo: boolean;
  contacto_previo_detalle: string | null;
  no_contactar: boolean;
  no_contactar_motivo: string | null;
  notas: string | null;
}

export interface ResumenProspectos {
  total: number;
  contactables: number;
  por_estado: Record<string, number>;
  segmentos: { segmento: string; cantidad: number }[];
  ciudades: string[];
}

export interface CampanaProspecto {
  id: number;
  nombre: string;
  canal: string;
  estado: 'borrador' | 'lista' | 'enviando' | 'pausada' | 'terminada' | 'cancelada';
  asunto: string | null;
  cuerpo: string | null;
  incluir_contacto_previo: boolean;
  created_at: string | null;
  destinatarios: number;
  por_estado: Record<string, number>;
  omitidos_por_motivo: Record<string, number>;
  items?: { prospecto: Prospecto; estado: string; motivo: string | null }[];
}

/** Una selección: ids a mano, o todos los que cumplen un filtro. */
export interface Seleccion {
  ids?: number[];
  filtro?: FiltroProspectos;
}

const KEY = 'prospectos';

export function useProspectos(filtro: FiltroProspectos, pagina: number, porPagina = 50) {
  return useQuery({
    queryKey: [KEY, 'lista', filtro, pagina, porPagina],
    queryFn: async () => {
      const res = await api.get<{ data: { items: Prospecto[]; total: number } }>('/prospectos', {
        params: { ...filtro, pagina, por_pagina: porPagina },
      });
      return res.data.data;
    },
    placeholderData: prev => prev,
  });
}

export function useResumenProspectos() {
  return useQuery({
    queryKey: [KEY, 'resumen'],
    queryFn: async () => (await api.get<{ data: ResumenProspectos }>('/prospectos/resumen')).data.data,
  });
}

export function useContarSeleccion(filtro: FiltroProspectos | null) {
  return useQuery({
    queryKey: [KEY, 'contar', filtro],
    enabled: filtro !== null,
    queryFn: async () => (
      await api.post<{ data: { cantidad: number; supera_el_maximo: boolean; maximo: number } }>(
        '/prospectos/seleccion/contar', { filtro },
      )
    ).data.data,
  });
}

export function useCambiarEstadoProspectos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Seleccion & { estado: string }) => api.post('/prospectos/estado', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useNoEsClienteProspecto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/prospectos/${id}/no-es-cliente`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCruzarProspectos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/prospectos/cruzar'),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCampanasProspecto() {
  return useQuery({
    queryKey: [KEY, 'campanas'],
    queryFn: async () => (await api.get<{ data: CampanaProspecto[] }>('/prospectos/campanas')).data.data,
  });
}

export function useCampanaProspecto(id: number | null) {
  return useQuery({
    queryKey: [KEY, 'campana', id],
    enabled: id !== null,
    queryFn: async () => (await api.get<{ data: CampanaProspecto }>(`/prospectos/campanas/${id}`)).data.data,
  });
}

export function useCrearCampanaProspecto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Seleccion & { nombre: string; incluir_contacto_previo: boolean }) =>
      (await api.post<{ data: CampanaProspecto }>('/prospectos/campanas', p)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'campanas'] }),
  });
}

export function useGuardarMensajeCampana() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, asunto, cuerpo }: { id: number; asunto: string; cuerpo: string }) =>
      api.put(`/prospectos/campanas/${id}/mensaje`, { asunto, cuerpo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'campanas'] }),
  });
}

export function usePrepararCampana() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/prospectos/campanas/${id}/preparar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'campanas'] }),
  });
}
