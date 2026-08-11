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
  const previo = leerConsentimiento();
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

  // Si esta decisión *saca* un permiso que antes estaba dado, hay que borrar
  // las cookies que ese proveedor ya dejó. Desactivar el script a futuro no
  // alcanza: la cookie con el identificador sigue en el navegador y lo sigue
  // identificando en cuanto vuelva a activarse.
  //
  // El orden importa: primero se le avisa al script, después se borra. Al
  // revés no funciona —está verificado— porque `gtag` sigue vivo en memoria y
  // reescribe su cookie de sesión en el instante siguiente al borrado.
  avisarAProveedores(dato.analiticas, dato.publicidad);
  if (previo?.analiticas && !dato.analiticas) borrarCookiesGoogle();
  if (previo?.publicidad && !dato.publicidad) borrarCookiesMeta();

  window.dispatchEvent(new CustomEvent(EVENTO, { detail: dato }));
  return dato;
}

/**
 * Permite volver a abrir el aviso desde la política de privacidad.
 *
 * Borra también las cookies que Google y Meta ya hayan dejado. Sin esto,
 * "revocar" sólo dejaba de cargar los scripts la próxima vez: el `_ga` y el
 * `_fbp` seguían en el navegador durante dos años y el visitante seguía siendo
 * el mismo identificador para los dos. La política de privacidad promete que
 * eligiendo "sólo necesarias" esos servicios **no reciben ningún dato**, y con
 * la cookie puesta eso no era del todo cierto.
 */
export function revocarConsentimiento(): void {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
  avisarAProveedores(false, false);
  borrarCookiesGoogle();
  borrarCookiesMeta();
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: null }));
}

// ─── Avisarle a los scripts ya cargados ──────────────────────────────────────

/**
 * Le comunica la decisión a los scripts de Google y Meta que ya estén en
 * memoria, usando la API de consentimiento de cada uno.
 *
 * Hace falta porque **desmontar el `<script>` no descarga el script**. Si
 * alguien acepta y después revoca en la misma visita, `gtag` y `fbq` siguen
 * definidos y funcionando hasta que recargue la página. Sin este aviso, borrar
 * las cookies no servía de nada: se verificó que `gtag` reescribe su
 * `_ga_<ID>` inmediatamente después del borrado.
 *
 * Con el Consent Mode de Google, `denied` hace que gtag deje de escribir
 * cookies y de mandar identificadores. En Meta, `revoke` frena el envío de
 * eventos del píxel.
 */
function avisarAProveedores(analiticas: boolean, publicidad: boolean): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  };
  try {
    w.gtag?.("consent", "update", {
      analytics_storage: analiticas ? "granted" : "denied",
      ad_storage: publicidad ? "granted" : "denied",
      ad_user_data: publicidad ? "granted" : "denied",
      ad_personalization: publicidad ? "granted" : "denied",
    });
  } catch {
    /* gtag no cargado */
  }
  try {
    w.fbq?.("consent", publicidad ? "grant" : "revoke");
  } catch {
    /* el píxel no cargado */
  }
}

// ─── Limpieza de cookies de terceros ─────────────────────────────────────────

/**
 * Borra una cookie propia probando todas las combinaciones de dominio y ruta.
 *
 * Hace falta el barrido porque una cookie sólo se borra pisándola con el mismo
 * `domain` y `path` con los que se creó, y nosotros no los escribimos: los
 * eligió el script de Google o el de Meta. Google usa `.dominio.com.ar` y Meta
 * el host pelado, así que se prueban las dos formas.
 */
function borrarCookie(nombre: string): void {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  // `a.b.com.ar` → ["a.b.com.ar", ".b.com.ar", ".com.ar"]. Se corta en dos
  // partes para no intentar borrar sobre un dominio público como `.com.ar`.
  const partes = host.split(".");
  const dominios = [undefined as string | undefined, host];
  for (let i = 1; i <= partes.length - 2; i++) {
    dominios.push("." + partes.slice(i).join("."));
  }
  for (const dominio of dominios) {
    document.cookie =
      `${nombre}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` +
      (dominio ? `; domain=${dominio}` : "");
  }
}

/** `_ga`, `_ga_<ID>`, `_gid`, `_gat…` y el `_gcl_au` de Google Ads. */
function borrarCookiesGoogle(): void {
  if (typeof document === "undefined") return;
  const nombres = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => /^(_ga|_gid|_gat|_gcl_au)/.test(n));
  for (const n of new Set(nombres)) borrarCookie(n);
}

/** `_fbp` (el id del navegador) y `_fbc` (el click de un anuncio). */
function borrarCookiesMeta(): void {
  borrarCookie("_fbp");
  borrarCookie("_fbc");
}

export function aceptaPublicidad(): boolean {
  return leerConsentimiento()?.publicidad === true;
}

export function aceptaAnaliticas(): boolean {
  return leerConsentimiento()?.analiticas === true;
}
