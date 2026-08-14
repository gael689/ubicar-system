/**
 * Los eventos que medimos, en un solo lugar.
 *
 * Antes de este archivo la web medía **una sola cosa**: el click en un botón de
 * WhatsApp (`trackLeadEvent`). Todo el embudo de reserva —el flujo de 4 pasos,
 * que es el producto— no emitía nada. Se sabía cuánta gente entraba y cuánta
 * escribía por WhatsApp, y nada de lo que pasaba en el medio: ni qué categorías
 * se miran, ni en qué paso se cae la gente, ni cuántas reservas se cierran.
 *
 * ## Dos destinos, un evento
 *
 * Cada acción del negocio se manda a los dos lados, porque miden cosas
 * distintas y ninguno reemplaza al otro:
 *
 * - **Google Analytics 4** responde "qué pasa en el sitio": el embudo, dónde se
 *   cae la gente, qué categorías se miran. Usa los nombres de evento
 *   recomendados de e-commerce (`view_item_list`, `begin_checkout`,
 *   `purchase`…) porque son los que habilitan los informes de embudo y de
 *   monetización que GA4 arma solo. Un evento con nombre inventado también
 *   entra, pero queda fuera de esos informes y hay que graficarlo a mano.
 * - **Meta** responde "qué campaña trajo la reserva". Usa sus eventos estándar
 *   (`Search`, `InitiateCheckout`, `Purchase`…), que son los únicos que se
 *   pueden elegir como objetivo de optimización de un anuncio.
 *
 * ## Consentimiento
 *
 * Ninguna función de acá manda nada sin permiso, y el permiso es **por
 * categoría**: alguien puede aceptar analíticas y rechazar publicidad, y en ese
 * caso el evento va a GA4 y no a Meta. La comprobación vive dentro de
 * `aGoogle()` y `aMeta()`, no en cada llamada, justamente para que no se pueda
 * olvidar al agregar un evento nuevo.
 *
 * Además de esto, los scripts de GA y Meta directamente **no se descargan** sin
 * consentimiento (ver `components/Analitica.tsx`), así que sin aceptar no hay
 * ni siquiera un `gtag` al que llamarle.
 *
 * ## Regla de oro
 *
 * **Medir nunca puede romper la reserva.** Todo lo de acá es best-effort: si
 * falla, se traga el error y sigue. Un `await` colgado o una excepción en el
 * tracking no puede dejar a un cliente sin poder pagar.
 */

import { aceptaAnaliticas, aceptaPublicidad } from "@/lib/consentimiento";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

/** Los precios de la web son en pesos. Meta lo necesita para calcular ROAS. */
const MONEDA = "ARS";

type Parametros = Record<string, unknown>;

// ─── Los dos canales ─────────────────────────────────────────────────────────

/** Manda un evento a GA4. No hace nada sin consentimiento de analíticas. */
function aGoogle(nombre: string, parametros: Parametros = {}): void {
  if (typeof window === "undefined" || !aceptaAnaliticas()) return;
  try {
    window.gtag?.("event", nombre, parametros);
  } catch {
    /* medir nunca rompe el flujo */
  }
}

/**
 * Manda un evento a Meta por los dos caminos: el píxel del navegador y la
 * Conversions API del servidor.
 *
 * Los dos a la vez no duplica: Meta deduplica por `event_id`, que por eso se
 * genera acá una sola vez y viaja igual a los dos lados. Sin ese id, una misma
 * reserva contaría dos veces y el costo por conversión saldría a la mitad.
 *
 * Vale la pena mandar por los dos: el píxel solo lo bloquean los bloqueadores
 * de anuncios y Safari; el servidor solo pierde los datos del navegador.
 */
function aMeta(nombre: string, parametros: Parametros = {}): void {
  if (typeof window === "undefined" || !aceptaPublicidad()) return;

  const eventId = generarEventId();

  try {
    window.fbq?.("track", nombre, parametros, { eventID: eventId });
  } catch {
    /* el píxel puede no estar cargado todavía */
  }

  // No se espera la respuesta: es telemetría, no parte del flujo. `keepalive`
  // hace que el pedido sobreviva a la navegación que suele venir justo después
  // (por ejemplo, irse al checkout de Mercado Pago).
  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: nombre,
        eventId,
        eventSourceUrl: window.location.href,
        customData: parametros,
        fbc: leerCookie("_fbc"),
        fbp: leerCookie("_fbp"),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* sin red: se pierde el evento y no pasa nada más */
  }
}

function generarEventId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function leerCookie(nombre: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + nombre + "=([^;]+)"));
  return match ? match[2] : null;
}

// ─── El embudo de reserva ────────────────────────────────────────────────────
//
// Los cinco momentos que importan, en orden. La gracia de medirlos todos es
// poder leer la caída entre uno y otro: si de 100 que buscan, 40 eligen auto y
// sólo 3 pagan, el problema está en el checkout y no en los precios.

export interface DatosBusqueda {
  fechaInicio: string;
  fechaFin: string;
  lugarRetiro: string;
  dias: number;
  /** Cuántas categorías tenían cupo. Cero es el dato más valioso del sitio. */
  resultados: number;
}

/**
 * 1. Buscó disponibilidad para un rango de fechas.
 *
 * Es el verdadero inicio del embudo: entrar a la home no dice nada, pedir
 * fechas sí. `resultados: 0` alimenta la **demanda insatisfecha** —qué fechas y
 * qué categorías se piden y no hay— que es lo que dice qué autos conviene
 * comprar (ver la métrica en `docs/PLAN_ANALYTICS.md`).
 */
export function verDisponibilidad(d: DatosBusqueda): void {
  aGoogle("view_item_list", {
    item_list_name: "Disponibilidad",
    fecha_inicio: d.fechaInicio,
    fecha_fin: d.fechaFin,
    lugar_retiro: d.lugarRetiro,
    dias: d.dias,
    resultados: d.resultados,
  });
  aMeta("Search", {
    content_category: "Disponibilidad",
    search_string: `${d.fechaInicio} a ${d.fechaFin} · ${d.lugarRetiro}`,
    num_items: d.resultados,
  });

  // Búsqueda sin resultados: se marca aparte para poder filtrarla de un lado.
  if (d.resultados === 0) sinDisponibilidad(d);
}

/** 1-bis. Buscó y no había nada. Se emite solo desde `verDisponibilidad`. */
export function sinDisponibilidad(d: DatosBusqueda): void {
  aGoogle("sin_disponibilidad", {
    fecha_inicio: d.fechaInicio,
    fecha_fin: d.fechaFin,
    lugar_retiro: d.lugarRetiro,
    dias: d.dias,
  });
}

export interface DatosCategoria {
  categoriaId: number;
  nombre: string;
  precio?: number | null;
  dias?: number;
}

/**
 * 2. Eligió una categoría de la grilla.
 *
 * Acumulado por categoría, esto es el ranking de qué se mira más — que no es lo
 * mismo que qué se alquila más, y la diferencia entre ambos es donde está la
 * plata que se pierde.
 */
export function elegirCategoria(c: DatosCategoria): void {
  const item = {
    item_id: String(c.categoriaId),
    item_name: c.nombre,
    price: c.precio ?? undefined,
    quantity: 1,
  };
  aGoogle("select_item", { item_list_name: "Disponibilidad", items: [item] });
  aMeta("ViewContent", {
    content_type: "product",
    content_ids: [String(c.categoriaId)],
    content_name: c.nombre,
    value: c.precio ?? undefined,
    currency: MONEDA,
  });
}

/**
 * 3. Arrancó la reserva de verdad: se le tomó el cupo (el hold).
 *
 * Este es el `begin_checkout`, no el paso 1. La diferencia importa: mirar la
 * grilla es curiosear, que el sistema le reserve una unidad por 20 minutos es
 * intención real.
 */
export function iniciarReserva(c: DatosCategoria): void {
  aGoogle("begin_checkout", {
    currency: MONEDA,
    value: c.precio ?? undefined,
    items: [{ item_id: String(c.categoriaId), item_name: c.nombre, quantity: 1 }],
  });
  aMeta("InitiateCheckout", {
    content_type: "product",
    content_ids: [String(c.categoriaId)],
    content_name: c.nombre,
    value: c.precio ?? undefined,
    currency: MONEDA,
    num_items: 1,
  });
}

/**
 * 4. Completó sus datos personales y pasó al pago.
 *
 * El paso donde más se cae la gente en cualquier checkout, y el único que se
 * puede arreglar pidiendo menos campos. Sin medirlo no hay forma de saber si
 * conviene sacar alguno.
 */
export function completarDatos(valor?: number | null): void {
  aGoogle("add_shipping_info", { currency: MONEDA, value: valor ?? undefined });
  aMeta("AddPaymentInfo", { currency: MONEDA, value: valor ?? undefined });
}

export interface DatosReserva {
  /** El id que devuelve el backend. Sirve para no contar dos veces. */
  reservaId?: number | string | null;
  categoriaId?: number | null;
  categoriaNombre?: string | null;
  /** Lo que efectivamente se cobra ahora (el anticipo), no el total. */
  valor?: number | null;
  total?: number | null;
  dias?: number;
}

/**
 * 5. La reserva se concretó.
 *
 * **El evento que importa.** Es el que convierte todo lo anterior en un número
 * comparable: sin `purchase` en GA4 no hay tasa de conversión, y sin `Purchase`
 * en Meta los anuncios no pueden optimizar hacia reservas — optimizan hacia
 * clicks, que es lo que hacen cuando no se les dice otra cosa.
 *
 * `value` va con el **anticipo cobrado**, no con el total del alquiler: es la
 * plata que entró. El total viaja aparte para poder mirarlo en GA4.
 */
export function reservaConfirmada(r: DatosReserva): void {
  aGoogle("purchase", {
    transaction_id: r.reservaId ? String(r.reservaId) : undefined,
    currency: MONEDA,
    value: r.valor ?? undefined,
    total_alquiler: r.total ?? undefined,
    dias: r.dias,
    items: r.categoriaId
      ? [{
          item_id: String(r.categoriaId),
          item_name: r.categoriaNombre ?? undefined,
          quantity: 1,
        }]
      : undefined,
  });
  aMeta("Purchase", {
    currency: MONEDA,
    value: r.valor ?? undefined,
    content_type: "product",
    content_ids: r.categoriaId ? [String(r.categoriaId)] : undefined,
    content_name: r.categoriaNombre ?? undefined,
    num_items: 1,
  });
}

/**
 * Dejó sus datos para que lo contacten cuando no había cupo (D-04).
 *
 * No es una reserva, pero es un lead con fecha y categoría: vale medirlo aparte
 * para poder contarlo como conversión secundaria en las campañas.
 */
export function solicitudSinCupo(c: DatosCategoria): void {
  aGoogle("generate_lead", {
    tipo: "sin_cupo",
    categoria: c.nombre,
    currency: MONEDA,
    value: c.precio ?? undefined,
  });
  aMeta("Lead", {
    content_name: c.nombre,
    content_category: "sin_cupo",
    currency: MONEDA,
    value: c.precio ?? undefined,
  });
}

/**
 * Alguien dejó sus datos para que lo llamemos (D-61).
 *
 * **Sí manda `Lead`**, a diferencia de `derivacionComercial`: acá la persona
 * entregó su teléfono, que es la definición de un lead. Generaliza a
 * `solicitudSinCupo`, que sólo contemplaba el caso de la categoría agotada y
 * exigía una categoría que los otros dos motivos no tienen.
 */
export function solicitudContacto(d: { motivo: string; categoria?: string }): void {
  aGoogle("generate_lead", {
    tipo: d.motivo,
    categoria: d.categoria,
    currency: MONEDA,
  });
  aMeta("Lead", {
    content_name: d.categoria ?? d.motivo,
    content_category: d.motivo,
    currency: MONEDA,
  });
}

// ─── Contacto ────────────────────────────────────────────────────────────────

/**
 * Click en un botón de WhatsApp, mail o teléfono.
 *
 * Es lo único que la web medía antes de este archivo, y sólo hacia Meta. Ahora
 * también va a GA4 como `generate_lead`, así los dos informes cuentan lo mismo.
 *
 * `origen` identifica **qué** botón se tocó: no es lo mismo el flotante que el
 * de una tarjeta de vehículo, y hasta ahora todos contaban igual.
 */
export function contactoIniciado(origen: string): void {
  aGoogle("generate_lead", { tipo: "whatsapp", origen });
  aMeta("Lead", { content_category: origen });
}

/**
 * Click en un botón que lleva a `/reservar` desde una página de contenido.
 *
 * **No es un lead y por eso no manda `Lead`.** Hasta acá los botones "Ver
 * disponibilidad y precio" de la grilla de vehículos llamaban a
 * `trackLeadEvent`, o sea que cada persona que entraba a mirar precios contaba
 * como un contacto. Eso infla el número de leads con simple navegación y, peor,
 * le enseña a Meta a buscar gente que hace click y no gente que reserva: el
 * algoritmo optimiza hacia el evento que le declarás como conversión.
 *
 * Se mide igual porque dice qué sección de la portada empuja hacia la reserva,
 * pero con su propio nombre.
 */
export function intencionDeReserva(origen: string): void {
  aGoogle("select_promotion", { promotion_name: origen, destino: "/reservar" });
}

// ─── Derivación comercial (§3.9) ─────────────────────────────────────────────

/**
 * El cartel único que reemplaza los cuatro comportamientos distintos que
 * había para "la web no puede vender esto" (plan de conexión, 13/08). Se
 * manda cuando la persona toca alguno de los tres caminos —WhatsApp, seguir
 * en la web, o dejar consulta—, nunca al aparecer solo: es la señal de qué
 * camino se usa, no de cuántas veces se mostró el cartel.
 */
export function derivacionComercial(d: {
  motivo: "sin_cupo" | "anticipacion" | "horizonte" | "duracion" | "otro_lugar";
  // D-61: `telefono` y `mail` son canales nuevos del panel de derivación.
  // Sin ellos acá, un click en "Llamar" no se contaba en ningún lado.
  boton: "whatsapp" | "telefono" | "mail" | "seguir_web" | "consulta";
  categoria?: string;
}): void {
  aGoogle("generate_lead", {
    tipo: "derivacion_comercial",
    motivo: d.motivo,
    boton: d.boton,
    categoria: d.categoria,
  });
  if (d.boton === "whatsapp") {
    aMeta("Lead", { content_category: `derivacion_${d.motivo}` });
  }
}
