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

/**
 * Un importe con separador de miles y **como mucho dos decimales**.
 *
 * **`toLocaleString('es-AR')` a secas muestra hasta tres.** Es el default del
 * `Intl.NumberFormat` y por eso un precio por día de $100.000 ÷ 3 aparecía
 * escrito `$33.333,333`. Cuando además el número va a un `<input type="number">`
 * —que no pasa por ningún formateador— se ve entero: `33333.333333333336`.
 *
 * Los decimales sólo se imprimen si existen: un precio redondo se lee
 * "$200.000" y no "$200.000,00", que es como lo escribe cualquiera a mano.
 */
export function formatMiles(n: number | string | null | undefined, decimales = 2): string {
  if (n === null || n === undefined || n === '') return '';
  const num = typeof n === 'string' ? Number(n) : n;
  if (Number.isNaN(num)) return '';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  }).format(num);
}

/**
 * El número que hay detrás de un texto con puntos de miles.
 *
 * En castellano el punto separa miles y la coma decimales, o sea al revés que
 * `parseFloat`. `"200.000,50"` tiene que dar `200000.5` y no `200`.
 *
 * Devuelve `null` si no queda ningún dígito: es lo que distingue "el campo está
 * vacío" de "escribió cero", y con importes esas dos cosas no son lo mismo.
 */
export function parseMiles(texto: string): number | null {
  const limpio = texto.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!limpio || limpio === '-' || limpio === '.') return null;
  const n = Number(limpio);
  return Number.isNaN(n) ? null : n;
}

/**
 * Redondea a dos decimales, que es la unidad mínima con la que se factura.
 *
 * Existe porque el precio por día se deriva dividiendo el total por los días, y
 * esa división casi nunca da exacta: `100000 / 3` es `33333.333333333336` en
 * punto flotante. Ese número terminaba escrito en el formulario y viajando al
 * backend tal cual.
 */
export function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Un DNI o CUIT con los puntos y los guiones que uno espera.
 *
 * Pedido del mostrador: *"lo mismo de los puntos en los DNI… cuando uno lee
 * muchos números al día esto te ahorra problemas"*. `46901745` se lee mal;
 * `46.901.745` se compara de un vistazo contra el documento que el cliente
 * tiene en la mano.
 *
 * - 7 u 8 dígitos → DNI, puntos cada tres: `46.901.745`
 * - 11 dígitos    → CUIT, con guiones: `20-46901745-3`
 * - cualquier otra cosa se devuelve tal cual. Eso incluye `A COMPLETAR`, que es
 *   el marcador del alta rápida y **no es un documento**: formatearlo lo
 *   disfrazaría de dato cargado.
 */
export function formatDocumento(valor: string | null | undefined): string {
  if (!valor) return '';
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length !== valor.trim().length) {
    // Trae letras o separadores: o ya está formateado, o es el marcador de
    // pendiente. En los dos casos se muestra como está.
    if (digitos.length === 0) return valor;
    if (/[a-zA-Z]/.test(valor)) return valor;
  }
  if (digitos.length === 11) {
    return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
  }
  if (digitos.length === 7 || digitos.length === 8) {
    return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  return valor;
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
