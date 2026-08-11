/**
 * Tracking del click de contacto.
 *
 * **Este archivo quedó como una fachada.** La lógica de medición se unificó en
 * `lib/analitica.ts`, que manda cada acción a Google Analytics **y** a Meta con
 * el mismo evento y respeta el consentimiento por categoría. Antes vivía acá y
 * sólo hablaba con Meta: la consecuencia era que GA4 no se enteraba de ninguna
 * conversión, y los dos informes nunca cerraban entre sí.
 *
 * Se mantiene el nombre `trackLeadEvent` porque lo importan seis componentes de
 * la portada. Renombrarlo no agregaba nada y tocaba archivos que no hacía falta
 * tocar. Para código nuevo, usar `contactoIniciado` de `lib/analitica.ts`.
 */

import { contactoIniciado } from "@/lib/analitica";

/**
 * Click en un CTA de contacto (WhatsApp, mail, teléfono).
 *
 * @param origen Qué botón se tocó, para poder distinguirlos en el informe.
 *   Sin él todos los clicks se cuentan juntos y no se sabe cuál funciona.
 *
 * Sigue devolviendo una promesa por compatibilidad con los llamadores que
 * hacían `await`, pero **no hay nada que esperar**: el envío es best-effort y
 * resuelve enseguida, así el `<a>` navega a WhatsApp sin demora.
 */
export async function trackLeadEvent(origen = "whatsapp"): Promise<void> {
  if (typeof window === "undefined") return;
  contactoIniciado(origen);
}
