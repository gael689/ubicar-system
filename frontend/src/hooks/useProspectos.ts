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
  solo_contactables?: boolean;
  nunca_contactados?: boolean;
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
  created_at: string | null;
  destinatarios: number;
  por_estado: Record<string, number>;
  omitidos_por_motivo: Record<string, number>;
  seguimientos?: Seguimiento[];
  firma_nombre?: string | null;
  firma_telefono?: string | null;
  progreso?: ProgresoCampana;
  items?: { prospecto: Prospecto; estado: string; motivo: string | null }[];
  envios?: EnvioDeCampana[];
}

/** Los números de una campaña que ya salió (o está saliendo). */
export interface ProgresoCampana {
  en_cola: number;
  enviados: number;
  entregados: number;
  rebotes: number;
  quejas: number;
  respuestas: number;
  bajas: number;
  empresas_contactadas: number;
  simulados: number;
  errores: number;
}

export interface EnvioDeCampana {
  id: number;
  prospecto_id: number;
  empresa: string;
  para: string;
  toque: number;
  estado: string;
  motivo: string | null;
  desde: string | null;
  asunto: string;
  cuerpo: string;
  simulado: boolean;
  programado_para: string;
  enviado_at: string | null;
}

export interface Seguimiento {
  dias: number;
  cuerpo: string;
}

export interface PlantillaProspeccion {
  id: string;
  nombre: string;
  descripcion: string;
  asuntos: string[];
  cuerpo: string;
  segmentos: string[];
  seguimientos: Seguimiento[];
}

export interface CatalogoDePlantillas {
  plantillas: PlantillaProspeccion[];
  variables: { nombre: string; ayuda: string }[];
  firma: { nombre: string; telefono: string };
}

/** Si hoy se puede mandar y, si no, por qué (en palabras de mostrador). */
export interface EstadoDelEnvio {
  listo: boolean;
  motivo: string | null;
  casillas_activas: number;
  simulado: boolean;
  solo_a: string[];
  en_horario: boolean;
}

export interface PanelProspeccion {
  contactables: number;
  enviados_semana: number;
  respuestas: number;
  bajas: number;
  envio: EstadoDelEnvio;
}

export interface Audiencias {
  todos: number;
  nunca_contactados: number;
  segmentos: { segmento: string; cantidad: number }[];
  ciudades: { ciudad: string; cantidad: number }[];
  no_se_les_escribe: Record<string, number>;
}

export interface Aviso {
  grave: boolean;
  texto: string;
}

export interface MensajeArmado {
  asunto: string;
  cuerpo: string;
  faltantes: string[];
  avisos: Aviso[];
}

export interface CalculoDeCampana {
  total: number;
  salen: number;
  no_salen: Record<string, number>;
  segmentos: { segmento: string; cantidad: number }[];
  plantilla_sugerida: string;
  nombre_sugerido: string;
  muestra: (MensajeArmado & {
    indice: number;
    de: number;
    prospecto: Pick<Prospecto, 'id' | 'nombre' | 'email' | 'segmento' | 'ciudad' | 'notas'>;
    seguimientos: (MensajeArmado & { dias: number })[];
  }) | null;
  plan: EstadoDelEnvio & {
    cantidad: number;
    por_dia: number;
    dias: number;
    termina: string | null;
    termina_texto: string | null;
  };
}

export interface MensajeDeCampana {
  asunto: string;
  cuerpo: string;
  seguimientos: Seguimiento[];
  firma_nombre: string;
  firma_telefono: string;
}

export interface Casilla {
  id: number;
  direccion: string;
  dominio: string;
  nombre_visible: string;
  responder_a: string | null;
  limite_dia: number;
  rampa_desde: string | null;
  estado: 'activa' | 'pausada' | 'inactiva';
  motivo_estado: string | null;
  cupo_hoy: number;
  enviados_hoy: number;
  en_rampa: boolean;
}

export interface RegistroDNS {
  proposito: string;
  tipo: string;
  nombre: string;
  nombre_completo: string;
  valor: string;
  prioridad: number | null;
  estado: 'verificado' | 'pendiente' | 'fallido' | 'sin_comprobar' | 'recomendado';
}

export interface FichaDeDominio {
  dominio: string;
  estado: 'verificado' | 'pendiente' | 'fallido' | 'sin_crear' | 'sin_comprobar';
  modo: 'api' | 'manual' | 'simulado';
  aviso: string | null;
  registros: RegistroDNS[];
  dmarc: RegistroDNS;
}

export interface CasillasYDominios {
  casillas: Casilla[];
  raiz: string;
  modo: 'api' | 'manual' | 'simulado';
  aviso: string | null;
  dominios: FichaDeDominio[];
  envio: EstadoDelEnvio;
}

export interface ProspectoNuevo {
  nombre: string;
  segmento?: string;
  ciudad?: string;
  email?: string;
  telefono?: string;
  website?: string;
  notas?: string;
}

export interface TotalesDeImportacion {
  nuevos: number;
  actualizados: number;
  invalidos: number;
  ya_clientes: number;
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

/**
 * Sube un archivo de prospectos (el que arma `--archivo` del sincronizador),
 * **de a lotes** para no mandar miles en un solo pedido. Devuelve los totales.
 */
async function importarPorLotes(lista: unknown[], simular: boolean): Promise<TotalesDeImportacion> {
  const totales = { nuevos: 0, actualizados: 0, invalidos: 0, ya_clientes: 0 };
  for (let i = 0; i < lista.length; i += 500) {
    const res = await api.post<{ data: TotalesDeImportacion }>(
      '/prospectos/importar-archivo', { prospectos: lista.slice(i, i + 500) },
      simular ? { params: { simular: true } } : undefined,
    );
    totales.nuevos += res.data.data.nuevos;
    totales.actualizados += res.data.data.actualizados;
    totales.invalidos += res.data.data.invalidos;
    totales.ya_clientes = res.data.data.ya_clientes;
  }
  return totales;
}

/** La vista previa de un archivo: cuenta nuevos / repetidos / inválidos **sin guardar nada**. */
export function useSimularImportacion() {
  return useMutation({ mutationFn: (lista: unknown[]) => importarPorLotes(lista, true) });
}

export function useImportarArchivoProspectos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lista: unknown[]) => importarPorLotes(lista, false),
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
    mutationFn: async (p: Seleccion & { nombre: string }) =>
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

// ─── Campaña rápida, casillas y lo que vuelve ────────────────────────────────

export function usePanelProspeccion() {
  return useQuery({
    queryKey: [KEY, 'panel'],
    queryFn: async () => (await api.get<{ data: PanelProspeccion }>('/prospectos/panel')).data.data,
  });
}

export function useAudiencias(activo = true) {
  return useQuery({
    queryKey: [KEY, 'audiencias'],
    enabled: activo,
    queryFn: async () => (await api.get<{ data: Audiencias }>('/prospectos/audiencias')).data.data,
  });
}

export function usePlantillasProspeccion() {
  return useQuery({
    queryKey: [KEY, 'plantillas'],
    staleTime: Infinity, // el catálogo es código: no cambia mientras la pantalla está abierta
    queryFn: async () => (await api.get<{ data: CatalogoDePlantillas }>('/prospectos/plantillas')).data.data,
  });
}

/**
 * Todo lo que "Nueva campaña" muestra en vivo: a cuántos les sale, la vista
 * previa con una empresa real y cuándo termina. Un solo pedido por cambio.
 */
export function useCalcularCampana(pedido: (Seleccion & Partial<MensajeDeCampana> & { indice: number }) | null) {
  return useQuery({
    queryKey: [KEY, 'calcular', pedido],
    enabled: pedido !== null,
    placeholderData: prev => prev,
    queryFn: async () => (
      await api.post<{ data: CalculoDeCampana }>('/prospectos/campanas/calcular', pedido)
    ).data.data,
  });
}

export function useEnviarPrueba() {
  return useMutation({
    mutationFn: async (p: MensajeDeCampana & { prospecto_id?: number }) => (
      await api.post<{ data: { para: string; desde: string; simulado: boolean } }>('/prospectos/campanas/prueba', p)
    ).data.data,
  });
}

export function useCrearCampanaRapida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Seleccion & MensajeDeCampana & { nombre: string; enviar: boolean }) => (
      await api.post<{ data: CampanaProspecto }>('/prospectos/campanas/rapida', p)
    ).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export type AccionDeCampana = 'lanzar' | 'pausar' | 'reanudar' | 'cancelar';

export function useAccionCampana() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: AccionDeCampana }) =>
      api.post(`/prospectos/campanas/${id}/${accion}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useMarcarRespondio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/prospectos/${id}/respondio`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useAgregarProspecto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: ProspectoNuevo) => (
      await api.post<{ data: Prospecto & { era_nuevo: boolean } }>('/prospectos', p)
    ).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCasillas() {
  return useQuery({
    queryKey: [KEY, 'casillas'],
    queryFn: async () => (await api.get<{ data: CasillasYDominios }>('/prospectos/casillas')).data.data,
  });
}

export interface DatosDeCasilla {
  direccion?: string;
  nombre_visible: string;
  responder_a?: string;
  limite_dia?: number;
}

export function useGuardarCasilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...datos }: DatosDeCasilla & { id?: number }) => (
      id
        ? await api.put<{ data: Casilla }>(`/prospectos/casillas/${id}`, datos)
        : await api.post<{ data: Casilla }>('/prospectos/casillas', datos)
    ).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export type AccionDeCasilla = 'pausar' | 'reactivar' | 'confirmar' | 'borrar';

export function useAccionCasilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: AccionDeCasilla }) => (
      accion === 'borrar'
        ? api.delete(`/prospectos/casillas/${id}`)
        : api.post(`/prospectos/casillas/${id}/${accion}`)
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Crea el subdominio en Resend, o le pide que lo vuelva a verificar. */
export function useDominio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nombre, accion }: { nombre: string; accion: 'crear' | 'verificar' }) => (
      await api.post<{ data: FichaDeDominio }>(
        accion === 'crear' ? '/prospectos/dominios' : '/prospectos/dominios/verificar', { nombre })
    ).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
