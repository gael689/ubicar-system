/**
 * Meta Conversions API — envío server-side del evento de Lead.
 *
 * Por qué existe esta ruta: en la versión Vite este POST se hacía **desde el
 * navegador**, con el access token embebido en el bundle (el propio código lo
 * admitía en un comentario). Cualquiera podía extraerlo del JS público y
 * mandar eventos falsos. Acá el token vive sólo en el servidor, en
 * `META_CONVERSIONS_TOKEN`, y nunca llega al cliente.
 *
 * De paso se elimina el request a `api.ipify.org` que hacía el navegador para
 * averiguar su propia IP: el servidor ya la tiene en los headers.
 */

const PIXEL_ID = process.env.META_PIXEL_ID ?? "26876823408666329";
const TOKEN = process.env.META_CONVERSIONS_TOKEN;
const GRAPH_VERSION = "v19.0";

interface CuerpoTrack {
  eventName?: string;
  eventSourceUrl?: string;
  fbc?: string | null;
  fbp?: string | null;
}

function ipDelCliente(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? undefined;
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

  const payload = {
    data: [
      {
        event_name: cuerpo.eventName ?? "Lead",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: cuerpo.eventSourceUrl,
        user_data: {
          client_ip_address: ipDelCliente(request),
          client_user_agent: request.headers.get("user-agent") ?? undefined,
          fbc: cuerpo.fbc ?? undefined,
          fbp: cuerpo.fbp ?? undefined,
        },
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
