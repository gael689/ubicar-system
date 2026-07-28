/**
 * Cliente de la API pública del sistema.
 *
 * Hasta acá `web/` no hablaba con el backend: `NEXT_PUBLIC_API_URL` estaba
 * declarado en `.env.example` y sin usar, y todos los CTA terminaban en
 * WhatsApp.
 *
 * El backend envuelve todo en `{ success, message, data }` — `request()`
 * desenvuelve para que los componentes trabajen con el dato pelado.
 */
import type {
  Adicional,
  CategoriaDisponible,
  ConfigPublica,
  Cotizacion,
  Hold,
  RespuestaDisponibilidad,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** El backend sirve las fotos de categoría desde /static, fuera de /api/v1. */
const ORIGEN = BASE.replace(/\/api\/v1\/?$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    // Sin red o backend caído. El mensaje va directo a la pantalla, así que
    // dice qué hacer en vez de nombrar el problema técnico.
    throw new ApiError(
      "No pudimos conectarnos. Revisá tu conexión o escribinos por WhatsApp.",
      0,
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok) {
    const detail = (body as { detail?: unknown })?.detail;
    const mensaje =
      typeof detail === "string"
        ? detail
        : (detail as { message?: string })?.message ??
          "Algo salió mal. Probá de nuevo en un momento.";
    throw new ApiError(mensaje, res.status);
  }

  return (body as Envelope<T>).data;
}

/** URL pública de una foto guardada en el storage del backend. */
export function urlFoto(key: string | null): string | null {
  return key ? `${ORIGEN}/static/${key.replace(/^\//, "")}` : null;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  config: () => request<ConfigPublica>("/public/config"),

  /** Devuelve sólo las categorías: el rango ya lo conoce quien pregunta. */
  disponibilidad: async (p: {
    fecha_inicio: string;
    fecha_fin: string;
    hora_inicio: string;
    hora_fin: string;
  }): Promise<CategoriaDisponible[]> => {
    const r = await request<RespuestaDisponibilidad>(
      `/public/disponibilidad?${new URLSearchParams(p)}`,
    );
    return r.categorias ?? [];
  },

  adicionales: () => request<Adicional[]>("/public/adicionales"),

  crearHold: (body: {
    categoria_id: number;
    fecha_inicio: string;
    hora_inicio: string;
    fecha_fin: string;
    hora_fin: string;
  }) => request<Hold>("/public/holds", { method: "POST", body: JSON.stringify(body) }),

  verHold: (token: string) => request<Hold>(`/public/holds/${token}`),

  extenderHold: (token: string) =>
    request<Hold>(`/public/holds/${token}/extender`, { method: "POST" }),

  liberarHold: (token: string) =>
    request<Hold>(`/public/holds/${token}`, { method: "DELETE" }),

  /**
   * Cotización con adicionales y recargo por edad.
   *
   * `fecha_nacimiento` no valida nada: sin ella simplemente no se aplica
   * ningún recargo por franja etaria (D-38), y el total sale igual.
   */
  calcularPrecio: (body: {
    fecha_inicio: string;
    fecha_fin: string;
    categoria_id: number;
    canal: "web";
    adicionales: { adicional_id: number; cantidad: number }[];
    fecha_nacimiento?: string | null;
  }) => request<Cotizacion>("/precios/calcular", { method: "POST", body: JSON.stringify(body) }),
};

// ─── Formato ─────────────────────────────────────────────────────────────────

const PESOS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const pesos = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "—" : PESOS.format(Number(v));

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function fechaCorta(iso: string): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]?.slice(0, 3)} ${a}`;
}
