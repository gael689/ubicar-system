/**
 * Cuántos días se cobran, **mirando también el horario** (plan 27/09, A1).
 *
 * Espejo de `backend/app/domain/tarifas.py::dias_facturables`. El backend es
 * el que cotiza y el que guarda; esto sólo sirve para mostrar la duración y el
 * aviso mientras se carga el formulario, sin esperar la cotización. Si alguna
 * vez cambia la regla, cambia en los dos lados en el mismo commit.
 *
 * - Diferencia de fechas, **+1 si la devolución es una hora o más después del
 *   horario de retiro** (tolerancia de 59 minutos).
 * - El mismo día es un día, sea cual sea el horario.
 * - Mínimo 1. Con fechas inválidas (devolución antes del retiro), 0.
 */
export const TOLERANCIA_DEVOLUCION_MINUTOS = 59;

function minutos(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const [h, m] = hora.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Diferencia de fechas ISO (`YYYY-MM-DD`) en días, sin pasar por la zona horaria. */
function diferenciaDias(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Minutos que la devolución se pasa del horario de retiro (negativo si es antes). */
export function minutosDeMas(horaInicio: string | null | undefined, horaFin: string | null | undefined): number {
  const ini = minutos(horaInicio);
  const fin = minutos(horaFin);
  if (ini === null || fin === null) return 0;
  return fin - ini;
}

/**
 * ¿Se cobra un día más por el horario? Sólo cuando hay al menos una noche de
 * por medio: el mismo día nunca suma.
 */
export function diaExtraPorHorario(
  fechaInicio: string, horaInicio: string | null | undefined,
  fechaFin: string, horaFin: string | null | undefined,
): boolean {
  if (!fechaInicio || !fechaFin || diferenciaDias(fechaInicio, fechaFin) < 1) return false;
  return minutosDeMas(horaInicio, horaFin) > TOLERANCIA_DEVOLUCION_MINUTOS;
}

export function diasFacturables(
  fechaInicio: string, horaInicio: string | null | undefined,
  fechaFin: string, horaFin: string | null | undefined,
): number {
  if (!fechaInicio || !fechaFin) return 0;
  const dias = diferenciaDias(fechaInicio, fechaFin);
  if (dias < 0) return 0;
  if (dias === 0) return 1;
  return dias + (diaExtraPorHorario(fechaInicio, horaInicio, fechaFin, horaFin) ? 1 : 0);
}

/**
 * El aviso que ve quien carga la reserva: "Devuelve 2 h después del horario
 * de retiro: se cobra 1 día más". `null` si no corresponde.
 */
export function avisoDiaExtra(
  fechaInicio: string, horaInicio: string | null | undefined,
  fechaFin: string, horaFin: string | null | undefined,
): string | null {
  if (!diaExtraPorHorario(fechaInicio, horaInicio, fechaFin, horaFin)) return null;
  const de = minutosDeMas(horaInicio, horaFin);
  const h = Math.floor(de / 60);
  const m = de % 60;
  const cuanto = m === 0 ? `${h} h` : `${h} h ${m} min`;
  return `Devuelve ${cuanto} después del horario de retiro: se cobra 1 día más.`;
}
