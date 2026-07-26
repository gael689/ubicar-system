import axios from 'axios';
import { toast } from 'sonner';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
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

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // Auth0 maneja el redirect al login
      } else if (error.response && error.response.status >= 500) {
        toast.error('Error del servidor. Intentá de nuevo.');
      } else if (!error.response) {
        toast.error('Sin conexión con el servidor.');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
