import axios from 'axios';
import { toast } from 'sonner';
import { mensajeSinRespuesta } from './utils';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

/**
 * Cuánto se espera antes de dar por cortado un request.
 *
 * **Eran 15 segundos y cortaban operaciones que el servidor sí completaba.**
 * `POST /reservas` generaba el PDF y mandaba el mail de confirmación adentro
 * del request —Resend es síncrono y sin timeout—, así que con la señal del
 * celular en el mostrador se pasaba de 15 segundos sin ninguna dificultad:
 * axios abortaba, la pantalla decía "sin conexión", y la reserva quedaba
 * creada igual. Eso ya se arregló del lado del servidor (los avisos salen
 * ahora en segundo plano), pero el margen se sube igual: el que abortaba era
 * el reloj de acá, y en 4G flojo un request normal puede tardar más de quince
 * segundos sin que nada esté roto.
 */
export const TIMEOUT_MS = 45_000;

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: TIMEOUT_MS,
});

/**
 * Resuelve una URL pública del backend (ej. `/static/...`) a una URL completa
 * que el navegador pueda usar para mostrar imágenes/PDFs.
 */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path}`;
}

/**
 * Cómo se consigue el token de Clerk en cada request.
 *
 * **No se guarda el token, se guarda la función que lo trae.** Los tokens de
 * sesión de Clerk duran ~60 segundos: pegarlo una vez en el header por
 * defecto haría que la app dejara de funcionar al minuto de abierta. El SDK
 * ya cachea y renueva por dentro, así que pedirlo en cada request no es caro.
 */
let obtenerToken: (() => Promise<string | null>) | null = null;

export function registrarProveedorDeToken(fn: (() => Promise<string | null>) | null) {
  obtenerToken = fn;
}

api.interceptors.request.use(async (config) => {
  if (obtenerToken) {
    const token = await obtenerToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // No se fuerza logout ni redirect: `<Show when="signed-out">` en
        // App.tsx ya muestra la pantalla de ingreso cuando la sesión cae.
        // Redirigir desde acá además pelearía con el router.
      } else if (error.response && error.response.status >= 500) {
        toast.error('Error del servidor. Intentá de nuevo.');
      } else if (!error.response) {
        // No dice "sin conexión" a secas: la mitad de las veces el pedido
        // llegó y lo que se perdió fue la respuesta. Ver `mensajeSinRespuesta`.
        toast.error(mensajeSinRespuesta(error));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
