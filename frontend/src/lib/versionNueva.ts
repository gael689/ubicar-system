import { toast } from 'sonner';

/**
 * Avisa cuando hay una versión nueva del sistema desplegada (14/10).
 *
 * El mostrador deja el sistema abierto todo el día: una pestaña abierta no se
 * entera de un deploy, y la única forma de ver lo nuevo era Ctrl+Shift+R. Acá
 * se compara el bundle que está corriendo con el que sirve hoy el servidor; si
 * cambió, aparece un aviso con "Actualizar".
 *
 * **No recarga solo**: alguien puede estar a mitad de una reserva, y perder el
 * formulario es peor que ver la versión nueva cinco minutos después.
 */
const CADA_MS = 5 * 60 * 1000;
const PATRON = /\/assets\/index-[^"']+\.js/;

function bundleActual(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return s ? new URL(s.src).pathname : null;
}

let avisado = false;

async function revisar(actual: string) {
  if (avisado || document.visibilityState !== 'visible') return;
  try {
    const res = await fetch('/', { cache: 'no-store' });
    if (!res.ok) return;
    const nuevo = (await res.text()).match(PATRON)?.[0];
    if (nuevo && nuevo !== actual) {
      avisado = true;
      toast('Hay una versión nueva del sistema', {
        description: 'Actualizá para ver los últimos cambios.',
        duration: Infinity,
        action: { label: 'Actualizar', onClick: () => window.location.reload() },
      });
    }
  } catch {
    /* sin red: se vuelve a probar en la próxima vuelta */
  }
}

export function vigilarVersionNueva() {
  // En desarrollo Vite no sirve un bundle con hash: no hay nada que comparar.
  if (import.meta.env.DEV) return;
  const actual = bundleActual();
  if (!actual) return;
  setInterval(() => void revisar(actual), CADA_MS);
  document.addEventListener('visibilitychange', () => void revisar(actual));

  // Si una pantalla que se carga aparte pide un archivo que el deploy ya
  // borró, Vite avisa con este evento: ahí sí se recarga, porque la pantalla
  // no puede abrirse de ninguna otra forma.
  window.addEventListener('vite:preloadError', () => window.location.reload());
}
