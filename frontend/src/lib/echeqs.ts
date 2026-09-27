import type { Echeq, EstadoEcheq } from '@/types';
import { hoyLocal } from '@/lib/utils';

export const ESTADOS_TRANSICION: Record<string, EstadoEcheq[]> = {
  en_cartera: ['depositado', 'endosado', 'rechazado', 'cobrado'],
  depositado: ['cobrado', 'rechazado'],
  endosado: ['cobrado', 'rechazado'],
  pendiente: ['cobrado', 'rechazado', 'en_cartera'],
  cobrado: [],
  rechazado: [],
  vencido: [],
};

const EN_CARTERA: string[] = ['en_cartera', 'pendiente'];
const ABIERTOS: string[] = [...EN_CARTERA, 'depositado', 'endosado'];

export function estaEnCartera(e: Echeq): boolean {
  return EN_CARTERA.includes(e.estado);
}

export function estaAbierto(e: Echeq): boolean {
  return ABIERTOS.includes(e.estado);
}

/**
 * La misma prioridad que el backend (`routers/echeqs.py::orden_de_trabajo`):
 * primero lo que pide una acción. Se repite acá para ordenar lo que ya está en
 * memoria (la pestaña del cliente, las secciones) sin depender del orden en
 * que llegó.
 */
function prioridad(e: Echeq): number {
  if (estaAbierto(e) && !e.datos_completos) return 0;
  if (estaEnCartera(e)) return 1;
  if (e.estado === 'depositado') return 2;
  if (e.estado === 'endosado') return 3;
  return 4;
}

export function ordenarEcheqs(echeqs: Echeq[]): Echeq[] {
  return [...echeqs].sort((a, b) => {
    const p = prioridad(a) - prioridad(b);
    if (p !== 0) return p;
    // Por vencimiento, los sin fecha al final.
    if (a.fecha_cobro !== b.fecha_cobro) {
      if (!a.fecha_cobro) return 1;
      if (!b.fecha_cobro) return -1;
      return a.fecha_cobro < b.fecha_cobro ? -1 : 1;
    }
    return a.id - b.id;
  });
}

/** Días hasta el cobro: negativo si ya venció, `null` sin fecha. */
export function diasParaCobro(e: Echeq, hoy = hoyLocal()): number | null {
  if (!e.fecha_cobro) return null;
  const ms = new Date(`${e.fecha_cobro}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime();
  return Math.round(ms / 86400000);
}

export type ClaveSeccion = 'vencidos' | 'proximos' | 'cartera' | 'depositados' | 'cerrados';

export interface SeccionEcheqs {
  clave: ClaveSeccion;
  titulo: string;
  echeqs: Echeq[];
  total: number;
}

const TITULOS: Record<ClaveSeccion, string> = {
  vencidos: 'Vencidos sin cobrar',
  proximos: 'Próximos 7 días',
  cartera: 'En cartera',
  depositados: 'Depositados / endosados',
  cerrados: 'Cerrados',
};

export function seccionDe(e: Echeq, hoy = hoyLocal()): ClaveSeccion {
  if (estaEnCartera(e)) {
    const dias = diasParaCobro(e, hoy);
    if (dias !== null && dias < 0) return 'vencidos';
    if (dias !== null && dias <= 7) return 'proximos';
    return 'cartera';
  }
  if (e.estado === 'depositado' || e.estado === 'endosado') return 'depositados';
  return 'cerrados';
}

/** Los echeqs repartidos en secciones de trabajo, cada una con su total. */
export function seccionesEcheqs(echeqs: Echeq[], hoy = hoyLocal()): SeccionEcheqs[] {
  const orden: ClaveSeccion[] = ['vencidos', 'proximos', 'cartera', 'depositados', 'cerrados'];
  const grupos = new Map<ClaveSeccion, Echeq[]>(orden.map(k => [k, []]));
  for (const e of ordenarEcheqs(echeqs)) grupos.get(seccionDe(e, hoy))!.push(e);
  return orden.map(clave => {
    const lista = grupos.get(clave)!;
    return {
      clave,
      titulo: TITULOS[clave],
      echeqs: lista,
      total: lista.reduce((s, e) => s + Number(e.monto || 0), 0),
    };
  });
}
