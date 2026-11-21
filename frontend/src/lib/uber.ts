/**
 * Contrato de Uber: las cuentas que salen del valor de la semana.
 *
 * Espejo de `backend/app/domain/uber.py`. Se calcula acá para mostrar el total
 * mientras se carga; **el que vale es el del backend**, que lo recalcula al
 * guardar con el mismo criterio.
 */

export const DIAS_POR_SEMANA = 7;

export function cantidadDeSemanas(dias: number): number {
  return Math.max(1, Math.ceil(Math.max(dias, 1) / DIAS_POR_SEMANA));
}

/** `valor semana × días / 7`, prorrateado (10 días no son dos semanas enteras). */
export function totalUber(valorSemana: number, dias: number): number {
  return Math.round(((valorSemana * Math.max(dias, 1)) / DIAS_POR_SEMANA) * 100) / 100;
}

function sumarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Una fecha por semana, empezando el día del retiro. Es sólo la propuesta. */
export function fechasDePagoUber(fechaInicio: string, dias: number): string[] {
  if (!fechaInicio) return [];
  return Array.from({ length: cantidadDeSemanas(dias) }, (_, i) =>
    sumarDiasISO(fechaInicio, DIAS_POR_SEMANA * i),
  );
}

// ─── Fechas alineadas ("paga los lunes") ─────────────────────────────────────
//
// Espejo de `realinear_fechas` y `validar_fechas_de_pago` del backend. El día
// de la semana usa la misma cuenta que Python: 0 = lunes … 6 = domingo.

export type ModalidadUber = 'adelantado' | 'vencido';

export const ETIQUETA_MODALIDAD: Record<ModalidadUber, string> = {
  adelantado: 'Semanal por adelantado',
  vencido: 'Semanal vencido',
};

export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Día de la semana de una fecha ISO: 0 = lunes … 6 = domingo. */
export function diaDeSemana(iso: string): number {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
}

/** `2026-11-23` → `lun 23/11`. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, mes, dia] = iso.split('-');
  return `${DIAS_CORTOS[diaDeSemana(iso)]} ${dia}/${mes}`;
}

/**
 * Una fecha de pago por semana, todas el mismo día.
 *
 * Por adelantado: el último `dia` en o antes del comienzo de cada semana, y
 * nunca antes del retiro (la primera se paga al llevarse el auto). Vencido: el
 * primer `dia` en o después del final de cada semana, y nunca después de
 * devolverlo.
 */
export function realinearFechas(
  fechaInicio: string, dias: number, dia: number, modalidad: ModalidadUber = 'adelantado',
): string[] {
  if (!fechaInicio) return [];
  const d = Math.max(dias, 1);
  const fin = sumarDiasISO(fechaInicio, d);
  const fechas: string[] = [];
  for (let i = 0; i < cantidadDeSemanas(d); i++) {
    const comienzo = sumarDiasISO(fechaInicio, DIAS_POR_SEMANA * i);
    let f: string;
    if (modalidad === 'vencido') {
      const cierre = sumarDiasISO(comienzo, DIAS_POR_SEMANA);
      f = sumarDiasISO(cierre, (dia - diaDeSemana(cierre) + 7) % 7);
      if (f > fin) f = fin;
    } else {
      f = sumarDiasISO(comienzo, -((diaDeSemana(comienzo) - dia + 7) % 7));
      if (f < fechaInicio) f = fechaInicio;
    }
    // Los topes pueden juntar dos semanas en el mismo día: cada una el suyo.
    const anterior = fechas[fechas.length - 1];
    if (anterior && f <= anterior) f = sumarDiasISO(anterior, 1);
    fechas.push(f);
  }
  return fechas;
}

/** `null` si las fechas sirven; si no, el mensaje para mostrar. */
export function validarFechasDePago(fechas: string[], dias: number): string | null {
  const semanas = cantidadDeSemanas(dias);
  const cargadas = fechas.filter(Boolean);
  if (cargadas.length !== fechas.length) return 'Falta completar una fecha de pago.';
  if (fechas.length !== semanas) {
    return `El contrato dura ${semanas} ${semanas === 1 ? 'semana' : 'semanas'} y tiene ${fechas.length} `
      + `${fechas.length === 1 ? 'fecha' : 'fechas'} de pago: tiene que haber una por semana.`;
  }
  for (let i = 1; i < fechas.length; i++) {
    if (fechas[i] <= fechas[i - 1]) {
      return 'Las fechas de pago tienen que ir en orden y no repetirse: cada semana se paga en una fecha distinta.';
    }
  }
  return null;
}

// ─── Condición de pago ───────────────────────────────────────────────────────
//
// Se guarda en el mismo campo de texto de siempre (`condicion_pago_texto`):
// "Semanal por adelantado — por transferencia". Un contrato viejo con texto
// libre no se migra: se lee entero como nota.

export function armarCondicion(modalidad: ModalidadUber, nota: string): string {
  const limpia = nota.trim();
  return limpia ? `${ETIQUETA_MODALIDAD[modalidad]} — ${limpia}` : ETIQUETA_MODALIDAD[modalidad];
}

export function separarCondicion(texto: string | null | undefined): { modalidad: ModalidadUber; nota: string } {
  const limpio = (texto ?? '').trim();
  for (const modalidad of Object.keys(ETIQUETA_MODALIDAD) as ModalidadUber[]) {
    const etiqueta = ETIQUETA_MODALIDAD[modalidad];
    if (limpio.toLowerCase().startsWith(etiqueta.toLowerCase())) {
      return { modalidad, nota: limpio.slice(etiqueta.length).replace(/^[\s—\-·:,.]+/, '').trim() };
    }
  }
  return { modalidad: 'adelantado', nota: limpio };
}

// ─── Kilómetros ──────────────────────────────────────────────────────────────

export interface ConsumoKmCalculado {
  recorridos: number;
  permitidos: number | null;
  excedidos: number;
  costoEstimado: number;
}

/**
 * Una lectura del odómetro contra el tope prorrateado a ese día. Espejo de
 * `consumo_de_km` del backend, para mostrar la cuenta mientras se tipea.
 * **Sólo informa**: el excedente se cobra al cierre, contra todo el contrato.
 */
export function consumoKm(d: {
  kmLectura: number; kmInicial: number; kmSemana: number | null; precioKmExtra: number | null;
  fechaInicio: string; fecha: string; fechaFin: string;
}): ConsumoKmCalculado {
  const recorridos = Math.max(d.kmLectura - d.kmInicial, 0);
  if (!d.kmSemana) return { recorridos, permitidos: null, excedidos: 0, costoEstimado: 0 };
  const dia = (iso: string) => new Date(`${iso}T12:00:00`).getTime() / 86_400_000;
  const delContrato = Math.max(Math.round(dia(d.fechaFin) - dia(d.fechaInicio)), 1);
  const transcurridos = Math.min(Math.max(Math.round(dia(d.fecha) - dia(d.fechaInicio)), 1), delContrato);
  const permitidos = Math.round(((d.kmSemana * transcurridos) / DIAS_POR_SEMANA) * 100) / 100;
  const excedidos = Math.max(recorridos - permitidos, 0);
  return {
    recorridos,
    permitidos,
    excedidos,
    costoEstimado: d.precioKmExtra ? Math.round(excedidos * d.precioKmExtra * 100) / 100 : 0,
  };
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

/** Bahía Blanca: lo que se le antepone a un número cargado sin característica. */
const CARACTERISTICA_LOCAL = '291';

/**
 * El teléfono de un chofer como lo quiere `wa.me`: **`549` + característica +
 * número**, sin el 0 ni el 15.
 *
 * Los números se cargan de mil formas —"0291 15 418-0554", "+54 9 291
 * 4180554", "4180554"— y el resto del sistema sólo les saca lo que no es
 * dígito, que alcanza cuando ya vienen con el 54 9. Acá el mensaje sale con un
 * clic desde una lista, así que se arma el formato entero; un número sin
 * característica se toma como de Bahía Blanca. Devuelve `null` si no hay con
 * qué armar un número.
 */
export function telefonoWhatsapp(telefono: string | null | undefined): string | null {
  let n = (telefono ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (n.length < 6) return null;
  // Con código de país: se le saca para normalizar el resto igual.
  const completo = n;
  if (n.startsWith('54') && n.length >= 12) n = n.slice(2);
  if (n.startsWith('9') && n.length === 11) n = n.slice(1);
  n = n.replace(/^0/, '');
  // Más largo que cualquier número argentino: es de otro país, va como está.
  if (n.length > 12) return completo;
  // El 15 del celular: va después de la característica (2 a 4 dígitos).
  if (n.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (n.slice(largo, largo + 2) === '15') { n = n.slice(0, largo) + n.slice(largo + 2); break; }
    }
  }
  if (n.startsWith('15') && (n.length === 8 || n.length === 9)) n = n.slice(2);
  if (n.length === 6 || n.length === 7) n = CARACTERISTICA_LOCAL + n;
  if (n.length !== 10) return null;
  return `549${n}`;
}

export interface DatosMensajeUber {
  chofer: string;
  estado: 'al_dia' | 'vence_hoy' | 'atrasado' | 'a_entregar';
  auto: string;
  semana: number | null;
  /** Lo que se le reclama: la cuota de hoy, o todo lo atrasado. */
  monto: number;
  semanasAdeudadas: number;
  proximaFecha: string | null;
}

function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

/** El mensaje prearmado según cómo viene el chofer. Se abre, no se manda solo. */
export function mensajeWhatsappUber(d: DatosMensajeUber): string {
  const nombre = d.chofer.trim().split(/\s+/)[0] || d.chofer;
  if (d.estado === 'atrasado') {
    const cuanto = d.semanasAdeudadas > 1 ? `${d.semanasAdeudadas} semanas` : `la semana ${d.semana ?? ''}`.trim();
    return `Hola ${nombre}, te escribimos de Ubicar Rent. Tenés pendiente ${cuanto} del ${d.auto}: ${pesos(d.monto)}. `
      + '¿Cuándo podés regularizarlo? Gracias.';
  }
  if (d.estado === 'vence_hoy') {
    return `Hola ${nombre}, te recordamos que hoy vence la semana ${d.semana ?? ''} del ${d.auto}: ${pesos(d.monto)}. `
      + 'Cualquier cosa avisanos. ¡Gracias!';
  }
  if (d.estado === 'a_entregar') {
    return `Hola ${nombre}, te escribimos de Ubicar Rent por la entrega del ${d.auto}.`;
  }
  const cuando = d.proximaFecha ? ` El próximo pago es el ${fechaCorta(d.proximaFecha)}: ${pesos(d.monto)}.` : '';
  return `Hola ${nombre}, te escribimos de Ubicar Rent por el ${d.auto}.${cuando}`;
}

export function linkWhatsappUber(telefono: string | null | undefined, mensaje: string): string | null {
  const numero = telefonoWhatsapp(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null;
}
