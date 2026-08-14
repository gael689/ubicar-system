import { textoPlazo } from "./api";

/**
 * Los tres bordes de la ventana de venta online, en un solo lugar (D-60).
 *
 * Vivían adentro de `Paso1Vehiculo` como un `useMemo`, cuando el Hero necesita
 * exactamente el mismo cálculo desde que el calendario dejó de deshabilitar
 * los días de los próximos {anticipacion} — copiarlo era pedir que las dos
 * copias derivaran, que es lo que D-56 ya tuvo que arreglar con los lugares de
 * retiro (§7).
 *
 * Los números **siempre** salen de `/public/config`, que los lee de la misma
 * tabla `configuracion` que valida el backend. Acá no hay ninguna constante.
 */

export type MotivoVentana = "anticipacion" | "horizonte" | "duracion";

export interface LimitesVentana {
  anticipacionHoras: number;
  horizonteMaximoDias?: number;
  duracionMaximaDias?: number;
}

interface RangoElegido {
  fechaInicio?: string | null;
  horaInicio?: string | null;
  fechaFin?: string | null;
  horaFin?: string | null;
}

/** Medianoche local del día que representa un `yyyy-MM-dd`.
 *
 *  `new Date("2026-08-20")` lo interpreta como medianoche **UTC**, que en
 *  Argentina es la noche del 19 — comparado contra una medianoche local daba
 *  un día de menos según la hora. Con el sufijo explícito no hay ambigüedad. */
function medianocheLocal(fecha: string): Date {
  return new Date(`${fecha}T00:00:00`);
}

/**
 * Qué borde de la ventana rompe el rango elegido, o `null` si entra.
 *
 * **`anticipacion` y `horizonte` se deciden sólo con la fecha de retiro**: el
 * Hero muestra el cartel apenas se elige el día de retiro, sin esperar la
 * devolución. `duracion` sí necesita las dos, porque es la diferencia entre
 * ellas. En `Paso1Vehiculo` no cambia nada: ahí el render ya está guardado por
 * `buscado`, que exige las dos fechas.
 */
export function motivoVentanaVenta(
  rango: RangoElegido,
  limites: LimitesVentana,
): MotivoVentana | null {
  if (!rango.fechaInicio) return null;

  const ahora = new Date();
  const inicio = new Date(`${rango.fechaInicio}T${rango.horaInicio || "10:00"}:00`);

  // Se compara en horas, no en días, igual que el backend
  // (`app/domain/disponibilidad.py`). Elegir "dentro de 10 días exactos" a las
  // 08:00 cuando son las 20:00 da 228h < 240h y deriva — es correcto, no un bug.
  const horasHastaRetiro = (inicio.getTime() - ahora.getTime()) / 3_600_000;
  if (horasHastaRetiro < limites.anticipacionHoras) return "anticipacion";

  if (limites.horizonteMaximoDias) {
    const hoy = medianocheLocal(
      `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`,
    );
    const diasHastaRetiro = Math.floor(
      (medianocheLocal(rango.fechaInicio).getTime() - hoy.getTime()) / 86_400_000,
    );
    if (diasHastaRetiro > limites.horizonteMaximoDias) return "horizonte";
  }

  if (limites.duracionMaximaDias && rango.fechaFin) {
    const fin = new Date(`${rango.fechaFin}T${rango.horaFin || "10:00"}:00`);
    const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000);
    if (dias > limites.duracionMaximaDias) return "duracion";
  }

  return null;
}

/** El plazo que completa el copy del cartel — "10 días", "4 meses", "90 días". */
export function detalleVentana(motivo: MotivoVentana, l: LimitesVentana): string {
  switch (motivo) {
    case "anticipacion":
      return textoPlazo(l.anticipacionHoras / 24);
    case "horizonte":
      return textoPlazo(l.horizonteMaximoDias ?? 0, true);
    case "duracion":
      return textoPlazo(l.duracionMaximaDias ?? 0);
  }
}

/** La línea que explica el porqué adentro del mensaje de WhatsApp. */
export function motivoTextoVentana(motivo: MotivoVentana, l: LimitesVentana): string {
  switch (motivo) {
    case "anticipacion":
      return `Me apareció que las reservas online necesitan ${detalleVentana(motivo, l)} de anticipación.`;
    case "horizonte":
      return `Me apareció que online reservan hasta ${detalleVentana(motivo, l)} adelante.`;
    case "duracion":
      return `Me apareció que para más de ${detalleVentana(motivo, l)} lo coordinan por WhatsApp.`;
  }
}
