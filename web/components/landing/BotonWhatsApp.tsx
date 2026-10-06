"use client";

import { IconoWhatsApp } from "@/components/IconoWhatsApp";
import { whatsappLink } from "@/lib/constants";
import { trackLeadEvent } from "@/lib/meta-pixel";

/**
 * El botón de WhatsApp de una página de servicio. Es cliente sólo por el
 * `onClick`: medir el contacto como lead con el origen de la página, para saber
 * cuál de ellas vende.
 */
export function BotonWhatsApp({
  mensaje, origen, claro = false, ancho = false,
}: {
  mensaje: string;
  /** Qué página lo emitió, para la medición. */
  origen: string;
  /** Sobre fondo oscuro. */
  claro?: boolean;
  /** Ocupa todo el ancho (dentro de una tarjeta). */
  ancho?: boolean;
}) {
  return (
    <a
      href={whatsappLink(mensaje)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackLeadEvent(`landing:${origen}:whatsapp`)}
      className={
        "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-colors " +
        (ancho ? "w-full " : "") +
        (claro
          ? "bg-white text-[#1B3F6B] hover:bg-white/90"
          : "bg-[#1B3F6B] text-white hover:bg-[#15335a]")
      }
    >
      <IconoWhatsApp className="h-4 w-4" />
      Consultar por WhatsApp
    </a>
  );
}
