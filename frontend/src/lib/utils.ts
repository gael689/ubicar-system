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
export function extractError(err: unknown, fallback = 'Algo salió mal'): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail.map((d: { msg: string }) => d.msg).join(', ');
    }
    if (!err.response) return 'Sin conexión con el servidor';
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
