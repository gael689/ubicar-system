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
