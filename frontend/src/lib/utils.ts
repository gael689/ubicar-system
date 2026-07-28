import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import axios from 'axios';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-AR').format(n);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
}

export function calcularDias(fechaInicio: string, fechaFin: string): number {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  return Math.max(Math.ceil((fin.getTime() - inicio.getTime()) / 86400000), 1);
}

/**
 * Extrae un mensaje legible de un error de axios.
 * El backend devuelve siempre { detail, success: false } para errores de negocio.
 */
/**
 * Los conflictos del backend vienen como `codigo|mensaje|extra` — el código lo
 * usa la UI para decidir qué ofrecer, el extra lleva un id o un contador.
 * Nada de eso es para leer: mostrarlo crudo le pone
 * "vehiculo_con_reservas|..." adelante a la frase.
 */
function soloElMensaje(detail: string): string {
  const partes = detail.split('|');
  // Un código no tiene espacios. Si el primer tramo los tiene, el `|` era
  // parte del texto y no un separador.
  if (partes.length >= 2 && partes[0].length > 0 && !partes[0].includes(' ')) {
    return partes[1];
  }
  return detail;
}

/** El código de un conflicto (`vehiculo_con_reservas`, `solapamiento`…), para
 *  que la UI decida qué ofrecer. `null` si el error no trae uno. */
export function codigoDeError(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const detail = err.response?.data?.detail;
  if (typeof detail !== 'string') return null;
  const codigo = detail.split('|')[0];
  return codigo && !codigo.includes(' ') && detail.includes('|') ? codigo : null;
}

export function extractError(err: unknown, fallback = 'Algo salió mal'): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return soloElMensaje(detail);
    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail.map((d: { msg: string }) => d.msg).join(', ');
    }
    if (!err.response) return 'Sin conexión con el servidor';
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
