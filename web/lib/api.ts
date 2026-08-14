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
  CheckoutIniciado,
  CondicionIva,
  ConfigPublica,
  ContratoParaFirmar,
  Cotizacion,
  Hold,
  ReservaPorTransferencia,
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

/**
 * El cuerpo del paso 4, igual para los dos caminos de pago.
 *
 * **No lleva precio.** El total se recalcula en el servidor: es un endpoint
 * público y el monto a cobrar es justamente lo que alguien querría manipular
 * desde el navegador.
 */
export interface ReservaWebBody {
  hold_token: string;
  nombre: string;
  email: string;
  telefono: string;
  dni: string;
  lugar_entrega: string;
  lugar_devolucion?: string;
  porcentaje_anticipo: number;
  adicionales: { adicional_id: number; cantidad: number }[];
  fecha_nacimiento?: string | null;
  notas?: string;
  /** Para el comprobante. No cambia el precio: los precios ya son finales con
   *  IVA incluido. Ver `Cliente.condicion_iva` en el backend. */
  condicion_iva?: CondicionIva | null;
  razon_social?: string | null;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const api = {
  config: () => request<ConfigPublica>("/public/config"),

  /**
   * Devuelve sólo las categorías: el rango ya lo conoce quien pregunta.
   *
   * `edad` es la que se declara en el Hero y hace que **el precio de cada
   * tarjeta ya incluya el recargo por edad**. Sin ella el backend cotiza
   * igual, pero el número mostrado acá subiría más adelante, cuando el
   * cliente ya eligió.
   */
  disponibilidad: async (p: {
    fecha_inicio: string;
    fecha_fin: string;
    hora_inicio: string;
    hora_fin: string;
    edad?: string;
  }): Promise<CategoriaDisponible[]> => {
    const query = new URLSearchParams(
      Object.entries(p).filter(([, v]) => Boolean(v)) as [string, string][],
    );
    const r = await request<RespuestaDisponibilidad>(
      `/public/disponibilidad?${query}`,
    );
    return r.categorias ?? [];
  },

  adicionales: () => request<Adicional[]>("/public/adicionales"),

  /**
   * Deja los datos de alguien que quiso una categoría sin cupo (D-04).
   *
   * **No cobra nada**, así que no depende de Mercado Pago: es la mitad del
   * flujo que ya se puede usar. Sin esto, quien busca fechas agotadas se va
   * del sitio y ese contacto se pierde.
   */
  crearSolicitud: (body: {
    categoria_id: number;
    fecha_inicio: string;
    hora_inicio: string;
    fecha_fin: string;
    hora_fin: string;
    lugar_entrega: string;
    lugar_devolucion?: string;
    nombre: string;
    email: string;
    telefono: string;
    notas?: string;
  }) =>
    request<{ reserva_id: number; categoria: string }>("/public/solicitudes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

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
   *
   * **Va contra `/public/cotizar`, no contra `/precios/calcular`.** El segundo
   * pide login: en desarrollo pasaba igual por el bypass de autenticación, y
   * en producción devolvía 401 en los pasos 2, 3 y 4 — el cliente elegía un
   * seguro y el total desaparecía. El canal no se manda: lo fija el servidor
   * en `web`, así la lista de precios del mostrador no queda a un fetch de
   * distancia desde la consola del navegador.
   */
  calcularPrecio: (body: {
    fecha_inicio: string;
    fecha_fin: string;
    categoria_id: number;
    adicionales: { adicional_id: number; cantidad: number }[];
    fecha_nacimiento?: string | null;
    /** La declarada en el Hero. Sostiene el precio en los pasos 2 y 3, antes
     *  de que exista la fecha de nacimiento. Cuando esa llega, manda ella. */
    edad?: number | null;
    /**
     * Cuánto adelanta. **Cambia el total**: el descuento por duración sólo
     * corre pagando el 100%. Va en `null` mientras no lo haya elegido.
     *
     * Mándelo o no, la respuesta trae **los dos escenarios** (`total_lista`,
     * `pago_total` y `anticipos`): esto sólo elige cuál de los dos viene
     * desglosado línea por línea en el cuerpo de la cotización.
     */
    porcentaje_anticipo?: number | null;
  }) => request<Cotizacion>("/public/cotizar", { method: "POST", body: JSON.stringify(body) }),

  /**
   * Abre el checkout de Mercado Pago (ítem 62).
   *
   * **No manda el precio.** El total se recalcula en el servidor: es un
   * endpoint público y el monto a cobrar es justamente lo que alguien querría
   * manipular desde el navegador.
   *
   * La reserva queda en `pendiente_pago` y **se confirma en el webhook**, no
   * al volver del checkout: el cliente puede cerrar la pestaña y el pago
   * igual entra.
   */
  crearReserva: (body: ReservaWebBody) =>
    request<CheckoutIniciado>("/public/reservas", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /**
   * La misma reserva, a pagar por **transferencia bancaria**.
   *
   * Mismo hold y mismo recálculo de precio del lado del servidor que el
   * checkout de Mercado Pago, con una diferencia de fondo: **acá no hay
   * webhook**. La reserva queda en `pendiente_pago` y no se confirma sola —
   * el cliente manda el comprobante por WhatsApp y alguien del equipo lo
   * concilia contra el extracto. Por eso la respuesta trae los datos de la
   * cuenta y el WhatsApp: sin eso el cliente no sabe qué hacer después.
   */
  crearReservaTransferencia: (body: ReservaWebBody) =>
    request<ReservaPorTransferencia>("/public/reservas/transferencia", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Firma del contrato por link (D-C6) ────────────────────────────────────

  /**
   * El contrato que hay detrás de un link de firma.
   *
   * Sigue respondiendo después de firmado y después de vencido: es lo que
   * permite volver a abrir el link y bajarse la copia.
   */
  contratoParaFirmar: (token: string) =>
    request<ContratoParaFirmar>(`/public/contratos/${token}`),

  firmarContrato: (
    token: string,
    body: {
      nombre: string;
      dni: string;
      firma_base64: string;
      aceptaciones: string[];
    },
  ) =>
    request<{ numero: string; firmado_at: string }>(
      `/public/contratos/${token}/firmar`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  /**
   * URL del PDF. Se devuelve la dirección y no el archivo: el navegador lo
   * abre en su visor, que en el teléfono es mucho mejor que una descarga que
   * cae en una carpeta que nadie encuentra.
   */
  urlContratoPdf: (token: string) => `${BASE}/public/contratos/${token}/pdf`,

  /**
   * Plan de conexión (13/08), §3.9 — lo que registra el cartel de derivación
   * comercial cada vez que aparece. **No es una consulta**: no lleva
   * contacto, no crea nada que alguien tenga que atender. Es fire-and-forget
   * a propósito: si esto falla, no puede romper el cartel que lo disparó.
   */
  registrarBusquedaSinResultado: (body: {
    motivo: "sin_cupo" | "anticipacion" | "horizonte" | "duracion" | "otro_lugar";
    boton_elegido: "whatsapp" | "telefono" | "mail" | "seguir_web" | "consulta";
    categoria_id?: number | null;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
  }) =>
    request<{ id: number }>("/public/estadisticas/busqueda-sin-resultado", {
      method: "POST",
      body: JSON.stringify(body),
    }).catch(() => null),
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

/**
 * "10 días" / "4 meses" (si `enMeses` y es múltiplo exacto de 30) / "90
 * días" — mismo criterio que `_texto_anticipacion` del backend: nadie
 * procesa "240 horas". Centralizado acá porque lo usan `Paso1Vehiculo` (el
 * cartel de derivación) y `BuscadorRango` (el aviso bajo el formulario) —
 * duplicarlo es el tipo de copia que termina desalineada (§7).
 */
export function textoPlazo(dias: number, enMeses = false): string {
  if (enMeses && dias % 30 === 0) {
    const meses = dias / 30;
    return `${meses} ${meses === 1 ? "mes" : "meses"}`;
  }
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}
