/**
 * El lugar "Otro (a coordinar)" (D-56 / D-61).
 *
 * El centinela vivía suelto en `Hero.tsx` y ahora lo necesitan también el
 * flujo y el buscador — exactamente el camino por el que D-56 terminó con
 * tres listas de lugares desalineadas.
 *
 * **`LUGAR_OTRO` es un valor interno y no se muestra nunca.** Ya se coló una
 * vez a la pantalla: el resumen de la reserva llegó a decir `__otro__` donde
 * tenía que decir el punto que la persona pidió. Para mostrar, va siempre
 * `nombreLugar()`.
 */
export const LUGAR_OTRO = "__otro__";

export function esLugarOtro(lugar: string | null | undefined): boolean {
  return lugar === LUGAR_OTRO;
}

/**
 * Cómo se le muestra un lugar a la persona.
 *
 * Para "Otro" devuelve lo que tipeó; si no tipeó nada, "A coordinar" — nunca
 * el centinela.
 */
export function nombreLugar(
  lugar: string | null | undefined,
  textoLibre?: string | null,
): string {
  if (!lugar) return "";
  if (!esLugarOtro(lugar)) return lugar;
  return textoLibre?.trim() || "A coordinar";
}
