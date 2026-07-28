/**
 * Consentimiento de cookies.
 *
 * **No es un cartel decorativo.** El píxel de Meta y Google Analytics sólo se
 * activan si el visitante acepta: eso es lo que hace que la política de
 * privacidad que publicamos sea cierta y no una declaración vacía.
 *
 * Tres categorías, y la distinción importa:
 * - **necesarias** — sin ellas el sitio no anda (la sesión del checkout).
 *   No se pueden rechazar y no se preguntan.
 * - **analiticas** — Google Analytics. Miden uso.
 * - **publicidad** — el píxel de Meta. Miden campañas y arman audiencias.
 *
 * Guardamos la decisión en `localStorage` y no en una cookie a propósito:
 * pedir permiso para cookies usando una cookie es incoherente, y además así
 * la preferencia no viaja en cada request.
 */

export const CLAVE = "ubicar_consentimiento";
/** Si cambian las categorías o los proveedores, se sube y se vuelve a preguntar. */
export const VERSION = 1;

export interface Consentimiento {
  version: number;
  analiticas: boolean;
  publicidad: boolean;
  fecha: string;
}

export const TODO_ACEPTADO: Omit<Consentimiento, "version" | "fecha"> = {
  analiticas: true,
  publicidad: true,
};

export const SOLO_NECESARIAS: Omit<Consentimiento, "version" | "fecha"> = {
  analiticas: false,
  publicidad: false,
};

/** El evento que dispara la web cuando la decisión cambia. */
export const EVENTO = "ubicar:consentimiento";

export function leerConsentimiento(): Consentimiento | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as Consentimiento;
    // Una decisión tomada sobre una versión vieja del aviso ya no vale.
    return dato?.version === VERSION ? dato : null;
  } catch {
    return null;
  }
}

export function guardarConsentimiento(
  opciones: Omit<Consentimiento, "version" | "fecha">,
): Consentimiento {
  const dato: Consentimiento = {
    ...opciones,
    version: VERSION,
    fecha: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(dato));
  } catch {
    /* modo privado o storage lleno: la decisión vale para esta sesión */
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: dato }));
  return dato;
}

/** Permite volver a abrir el aviso desde la política de privacidad. */
export function revocarConsentimiento(): void {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: null }));
}

export function aceptaPublicidad(): boolean {
  return leerConsentimiento()?.publicidad === true;
}

export function aceptaAnaliticas(): boolean {
  return leerConsentimiento()?.analiticas === true;
}
