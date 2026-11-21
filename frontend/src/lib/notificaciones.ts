/**
 * Cómo se dibujan los avisos: módulos, urgencias y antigüedad.
 *
 * **A qué módulo pertenece cada aviso ya no se decide acá.** Antes este archivo
 * tenía un mapa `tipo → familia` de sesenta líneas que había que acordarse de
 * tocar cada vez que el backend sumaba una regla — y cuando no se tocaba, el
 * aviso caía en "Otros", que es donde nadie mira. Ahora cada aviso llega con
 * su `modulo`, `modulo_label` y `accion` (ver `domain/avisos_catalogo.py`), y
 * acá sólo queda lo que es de pantalla: el ícono y el color de cada módulo.
 */
import {
  Bell, Building2, Calculator, CalendarDays, CalendarPlus, Car, CarFront, Globe, KeyRound,
  Lightbulb, ListChecks, Search, Star, TrendingUp, Users, Wallet,
} from 'lucide-react';
import type { NotificacionItem } from '@/types';

type Icono = React.ComponentType<{ className?: string }>;

export interface ModuloVisual {
  clave: string;
  label: string;
  icono: Icono;
  /** Color del ícono sobre fondo claro. */
  color: string;
}

/** Los módulos, **en el orden en que se muestran** (el mismo del backend). */
export const MODULOS: ModuloVisual[] = [
  { clave: 'operacion', label: 'Operación', icono: KeyRound, color: 'text-ubicar-primary' },
  { clave: 'cobranzas', label: 'Cobranzas', icono: Wallet, color: 'text-success' },
  { clave: 'flota', label: 'Flota', icono: Car, color: 'text-ubicar-dark' },
  { clave: 'clientes', label: 'Clientes', icono: Users, color: 'text-violet-700' },
  { clave: 'web', label: 'Web y ventas', icono: Globe, color: 'text-sky-700' },
  { clave: 'uber', label: 'Uber', icono: CarFront, color: 'text-slate-700' },
  { clave: 'configuracion', label: 'Falta completar', icono: ListChecks, color: 'text-warning' },
  { clave: 'oportunidades', label: 'Oportunidades', icono: Lightbulb, color: 'text-amber-600' },
];

/** Los que puede tener la campana: las oportunidades van por su pestaña. */
export const MODULOS_DE_AVISOS = MODULOS.filter(m => m.clave !== 'oportunidades');

const MODULO_DESCONOCIDO: ModuloVisual = {
  clave: 'otros', label: 'Otros', icono: Bell, color: 'text-muted-foreground',
};

/** El módulo con su ícono. Uno que esta versión de la pantalla no conoce (el
 *  backend sumó uno nuevo) se muestra igual, con la etiqueta que mandó. */
export function moduloVisual(clave: string, label?: string): ModuloVisual {
  return MODULOS.find(m => m.clave === clave)
    ?? { ...MODULO_DESCONOCIDO, clave, label: label || MODULO_DESCONOCIDO.label };
}

/** Ícono de cada oportunidad; la bombita para las que no tienen uno propio. */
const ICONO_OPORTUNIDAD: Record<string, Icono> = {
  op_auto_parado: Car,
  op_extension_posible: CalendarPlus,
  op_cliente_para_recontactar: Users,
  op_fecha_fuerte_con_autos_libres: CalendarDays,
  op_demanda_sin_cupo: Search,
  op_cotizacion_sin_cerrar: Calculator,
  op_ocupacion_alta: TrendingUp,
  op_pedir_resena: Star,
  op_prospectos_sin_contactar: Building2,
  op_auto_uber_libre: CarFront,
};

export function iconoDeOportunidad(tipo: string): Icono {
  return ICONO_OPORTUNIDAD[tipo] ?? Lightbulb;
}

export const URGENCIAS = ['critica', 'alta', 'media', 'baja'] as const;
export type Urgencia = (typeof URGENCIAS)[number];

export const URGENCIA_LABEL: Record<Urgencia, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

/** Color sólido, no transparente: lo que reclama atención tiene que verse
 *  como que la reclama. */
export const URGENCIA_COLOR: Record<string, string> = {
  critica: 'bg-danger text-white',
  alta: 'bg-warning text-white',
  media: 'bg-primary text-white',
  baja: 'bg-muted text-muted-foreground',
};

/** El puntito de cada aviso. */
export const URGENCIA_PUNTO: Record<string, string> = {
  critica: 'bg-danger',
  alta: 'bg-warning',
  media: 'bg-primary',
  baja: 'bg-slate-300',
};

const PESO_URGENCIA: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

/** Lo urgente primero y, a igual urgencia, lo más nuevo. */
export function porUrgencia(a: NotificacionItem, b: NotificacionItem): number {
  const d = (PESO_URGENCIA[a.urgencia] ?? 4) - (PESO_URGENCIA[b.urgencia] ?? 4);
  return d !== 0 ? d : b.created_at.localeCompare(a.created_at);
}

export function esUrgente(item: NotificacionItem): boolean {
  return item.urgencia === 'critica' || item.urgencia === 'alta';
}

/**
 * "hace 2 h", "hace 3 días".
 *
 * El backend guarda la hora en UTC y la manda sin zona (`2026-11-21T13:05:00`):
 * leída tal cual, el navegador la toma como hora local y en Argentina todo
 * aparecería tres horas más viejo de lo que es.
 */
export function antiguedad(iso: string, ahora: Date = new Date()): string {
  const conZona = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const minutos = Math.floor((ahora.getTime() - new Date(conZona).getTime()) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

/**
 * Hasta cuándo posponer: dentro de `n` días a las 8, que es cuando arranca el
 * mostrador. Se pospone de a varios días, no "mañana": lo que se posterga es lo
 * que hoy no se puede resolver, y recordarlo al día siguiente era el mismo
 * aviso otra vez.
 */
export function enDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

/** `1240000` → `$1.240.000`. Sin centavos: los impactos son estimaciones. */
export function pesosRedondos(monto: number): string {
  return `$${Math.round(monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}
