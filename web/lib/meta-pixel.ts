/**
 * Tracking del evento de Lead.
 *
 * Dos canales, como antes:
 *   1. Pixel del navegador (`fbq`), que se inicializa en `app/layout.tsx`.
 *   2. Conversions API — ahora vía `/api/track`, que corre en el servidor.
 *
 * El cambio importante respecto de la versión Vite: el access token de Meta
 * ya no viaja en el bundle. Acá sólo se mandan las cookies del pixel y la URL;
 * la IP y el user-agent los toma el servidor de los headers.
 */

import { aceptaPublicidad } from "@/lib/consentimiento";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function leerCookie(nombre: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + nombre + "=([^;]+)"));
  return match ? match[2] : null;
}

export async function trackLeadEvent(): Promise<void> {
  if (typeof window === "undefined") return;

  // Sin consentimiento de publicidad no se manda nada — ni el pixel del
  // navegador ni la Conversions API del servidor. El pixel ni siquiera está
  // cargado (ver components/Analitica.tsx), pero la llamada al servidor sí
  // saldría igual: es una petición nuestra, no de Meta.
  if (!aceptaPublicidad()) return;

  window.fbq?.("track", "Lead");

  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "Lead",
        eventSourceUrl: window.location.href,
        fbc: leerCookie("_fbc"),
        fbp: leerCookie("_fbp"),
      }),
      keepalive: true,
    });
  } catch {
    // El tracking nunca debe romper el flujo del usuario.
  }
}
