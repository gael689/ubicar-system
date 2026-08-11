/**
 * Meta Conversions API — envío server-side de los eventos de conversión.
 *
 * Por qué existe esta ruta: en la versión Vite este POST se hacía **desde el
 * navegador**, con el access token embebido en el bundle (el propio código lo
 * admitía en un comentario). Cualquiera podía extraerlo del JS público y
 * mandar eventos falsos. Acá el token vive sólo en el servidor, en
 * `META_CONVERSIONS_TOKEN`, y nunca llega al cliente.
 *
 * De paso se elimina el request a `api.ipify.org` que hacía el navegador para
 * averiguar su propia IP: el servidor ya la tiene en los headers.
 *
 * ## Qué cambió al sumar el embudo
 *
 * Antes esta ruta mandaba **siempre un `Lead`**, sin importar qué se le pidiera:
 * el nombre del evento se leía del body pero el resto del payload era fijo y sin
 * `value`, así que Meta no podía atribuirle plata a ninguna campaña. Ahora:
 *
 * - Acepta cualquier evento estándar de Meta (`Purchase`, `InitiateCheckout`…),
 *   pero **contra una lista blanca**: es un endpoint público sin autenticar y no
 *   corresponde que desde afuera se pueda inventar eventos en la cuenta.
 * - Reenvía `event_id` para que Meta **deduplique** contra el píxel del
 *   navegador, que manda el mismo evento con el mismo id. Sin esto cada reserva
 *   contaría dos veces y el costo por conversión saldría a la mitad.
 * - Reenvía `custom_data` (valor, moneda, categoría) **filtrado campo por
 *   campo**. Deliberadamente no se hace un passthrough del objeto: es la vía por
 *   la que se le terminan mandando a Meta datos personales sin querer.
 */

const PIXEL_ID = process.env.META_PIXEL_ID ?? "26876823408666329";
const TOKEN = process.env.META_CONVERSIONS_TOKEN;
const GRAPH_VERSION = "v19.0";

/**
 * Los únicos eventos que esta ruta acepta. Son los estándar de Meta que emite
 * `lib/analitica.ts`; cualquier otro nombre se descarta.
 */
const EVENTOS_PERMITIDOS = new Set([
  "Lead",
  "Search",
  "ViewContent",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
]);

interface CuerpoTrack {
  eventName?: string;
  eventId?: string;
  eventSourceUrl?: string;
  customData?: Record<string, unknown>;
  fbc?: string | null;
  fbp?: string | null;
}

function ipDelCliente(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

/**
 * Deja pasar sólo los campos de `custom_data` que Meta entiende, y con el tipo
 * que espera. Todo lo demás se descarta en silencio.
 */
function limpiarCustomData(datos: unknown): Record<string, unknown> | undefined {
  if (!datos || typeof datos !== "object") return undefined;
  const d = datos as Record<string, unknown>;
  const salida: Record<string, unknown> = {};

  const numero = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const texto = (v: unknown) =>
    typeof v === "string" && v.length <= 200 ? v : undefined;

  if (numero(d.value) !== undefined) salida.value = numero(d.value);
  if (texto(d.currency)) salida.currency = texto(d.currency);
  if (texto(d.content_name)) salida.content_name = texto(d.content_name);
  if (texto(d.content_category)) salida.content_category = texto(d.content_category);
  if (texto(d.content_type)) salida.content_type = texto(d.content_type);
  if (texto(d.search_string)) salida.search_string = texto(d.search_string);
  if (numero(d.num_items) !== undefined) salida.num_items = numero(d.num_items);

  // Los ids de categoría: array de strings cortos, hasta 20.
  if (Array.isArray(d.content_ids)) {
    const ids = d.content_ids
      .filter((v): v is string => typeof v === "string" && v.length <= 64)
      .slice(0, 20);
    if (ids.length) salida.content_ids = ids;
  }

  return Object.keys(salida).length ? salida : undefined;
}

export async function POST(request: Request) {
  if (!TOKEN) {
    // Sin token configurado es un no-op silencioso: en desarrollo no hay que
    // romper el formulario por no tener credenciales de Meta.
    return Response.json({ ok: false, motivo: "sin_token" }, { status: 200 });
  }

  let cuerpo: CuerpoTrack = {};
  try {
    cuerpo = (await request.json()) as CuerpoTrack;
  } catch {
    // Body vacío o inválido: se sigue con los defaults.
  }

  const nombre = cuerpo.eventName ?? "Lead";
  if (!EVENTOS_PERMITIDOS.has(nombre)) {
    return Response.json({ ok: false, motivo: "evento_no_permitido" }, { status: 200 });
  }

  const payload = {
    data: [
      {
        event_name: nombre,
        event_time: Math.floor(Date.now() / 1000),
        // La clave de la deduplicación contra el píxel del navegador.
        event_id: cuerpo.eventId,
        action_source: "website",
        event_source_url: cuerpo.eventSourceUrl,
        user_data: {
          client_ip_address: ipDelCliente(request),
          client_user_agent: request.headers.get("user-agent") ?? undefined,
          fbc: cuerpo.fbc ?? undefined,
          fbp: cuerpo.fbp ?? undefined,
        },
        custom_data: limpiarCustomData(cuerpo.customData),
      },
    ],
    access_token: TOKEN,
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return Response.json({ ok: res.ok }, { status: 200 });
  } catch {
    // El tracking nunca debe hacer fallar la acción del usuario.
    return Response.json({ ok: false, motivo: "error_red" }, { status: 200 });
  }
}
