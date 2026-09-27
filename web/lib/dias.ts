/**
 * Cuántos días se cobran, **mirando también el horario** (plan 27/09, A1).
 *
 * Espejo de `backend/app/domain/tarifas.py::dias_facturables` (y de
 * `frontend/src/lib/dias.ts`). El backend es el que cotiza; esto sirve para que
 * el sitio diga los mismos días **antes** de cotizar — el "un día más y ahorrás"
 * y la duración que se muestra. Contar sólo fechas decía "3 días" y el backend
 * cobraba 4 cuando la devolución era más tarde que el retiro. Si alguna vez
 * cambia la regla, cambia en los tres lados en el mismo commit.
 *
 * - Diferencia de fechas, **+1 si la devolución es una hora o más después del
 *   horario de retiro** (tolerancia de 59 minutos).
 * - El mismo día es un día, sea cual sea el horario.
 * - Con fechas inválidas (devolución antes del retiro) o vacías, 0.
 */
export const TOLERANCIA_DEVOLUCION_MINUTOS = 59;

function minutos(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const [h, m] = hora.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Diferencia de fechas ISO (`YYYY-MM-DD`) en días, sin pasar por la zona horaria. */
function diferenciaDias(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function diasFacturables(
  fechaInicio: string,
  horaInicio: string | null | undefined,
  fechaFin: string,
  horaFin: string | null | undefined,
): number {
  if (!fechaInicio || !fechaFin) return 0;
  const dias = diferenciaDias(fechaInicio, fechaFin);
  if (dias < 0) return 0;
  if (dias === 0) return 1;
  const ini = minutos(horaInicio);
  const fin = minutos(horaFin);
  const extra = ini !== null && fin !== null && fin - ini > TOLERANCIA_DEVOLUCION_MINUTOS;
  return dias + (extra ? 1 : 0);
}

/**
 * La fecha `YYYY-MM-DD` que queda `n` días después de `fecha`. En UTC a
 * propósito: `toISOString()` sobre una fecha local corría el día según la
 * zona horaria.
 */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}
