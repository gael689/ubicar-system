import type { CategoriaVehiculo, ModalidadItem, ItemCotizacion } from '@/types/cotizacion';

export const C = {
  primary:   '#407EC9',
  secondary: '#8BB8E8',
  surface:   '#EEF5FD',
  text:      '#1A2A3A',
  textMid:   '#3d5166',
  textLight: '#6b7f93',
  success:   '#1a9e4e',
  border:    '#d0e3f5',
  white:     '#ffffff',
  dark:      '#0f1e2e',
};

export const CATEGORIA_LABEL: Record<CategoriaVehiculo, string> = {
  compacto:  'Compacto',
  sedan:     'Sedán',
  sedan_sup: 'Sedán Superior',
  suv:       'SUV',
  camioneta: 'Pick up',
  furgon:    'Furgón',
};

export const MODALIDAD_LABEL: Record<ModalidadItem, string> = {
  mensual: 'Mensual',
  dias:    'Por días',
  libre:   'Presupuesto libre',
};

export const MODALIDAD_SHORT: Record<ModalidadItem, string> = {
  mensual: 'Mensual',
  dias:    'Por días',
  libre:   'Libre',
};

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

export function fmtDate(s: string): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${parseInt(d)} ${MESES[parseInt(m) - 1]} ${y}`;
}

export function fmtPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export function calcGranTotal(items: ItemCotizacion[]): number {
  return items.reduce((sum, it) => sum + (it.precio_total || 0), 0);
}

export function precioPorDia(item: ItemCotizacion): number | null {
  if (!item.dias || item.dias <= 0) return null;
  return item.precio_total / item.dias;
}

export function itemLabel(item: ItemCotizacion): string {
  return item.unidad ?? CATEGORIA_LABEL[item.categoria];
}
