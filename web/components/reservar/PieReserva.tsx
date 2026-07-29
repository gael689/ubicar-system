"use client";

import Link from "next/link";
import { MessageCircle, Mail, ShieldCheck, Clock, MapPin } from "lucide-react";
import { WHATSAPP_GENERAL, EMAIL } from "@/lib/constants";

/**
 * Pie del flujo de reserva.
 *
 * **No es el Footer del sitio.** Ese navega a los anclajes de la portada
 * (`#vehiculos`, `#contacto`), que dentro del flujo no llevan a ningún lado:
 * el visitante está en `/reservar` y esos anclajes no existen en esta página.
 *
 * Lo que sí hace falta acá es lo contrario del menú: **cerrar la venta.**
 * Alguien a punto de dejar los datos de su tarjeta necesita ver de quién es
 * el sitio, cómo hablar con una persona si algo no cierra, y dónde están los
 * términos que le están pidiendo aceptar. Los pasos 2 y 3 además dejan mucho
 * blanco abajo, y el blanco en una pantalla de pago se lee como que la página
 * cargó mal.
 */
export function PieReserva() {
  return (
    <footer className="mt-12 border-t border-border bg-white">
      <div className="container py-8">
        {/* Tres motivos para no abandonar el flujo. Van arriba porque son lo
            que se mira cuando aparece la duda, no cuando ya se fue. */}
        <div className="grid gap-4 border-b border-border pb-6 sm:grid-cols-3">
          <Tranquilidad
            icono={<ShieldCheck className="h-5 w-5" />}
            titulo="Reserva sin riesgo"
            texto="Confirmás recién cuando está todo claro. Si algo no cierra, te escribimos."
          />
          <Tranquilidad
            icono={<Clock className="h-5 w-5" />}
            titulo="Te respondemos el mismo día"
            texto="Lunes a sábado. Si reservás fuera de hora, te contestamos a primera hora."
          />
          <Tranquilidad
            icono={<MapPin className="h-5 w-5" />}
            titulo="Entrega en Bahía Blanca"
            texto="Retirás en nuestras oficinas o en el Aeropuerto Comandante Espora."
          />
        </div>

        <div className="flex flex-col gap-6 pt-6 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex shrink-0 items-center">
            {/* `img` y no `next/image`: es el mismo criterio que el Footer del
                sitio, un PNG chico servido desde /public que no necesita el
                pipeline de optimización. */}
            <img
              src="/img/logo.png"
              alt="Ubicar Rent"
              style={{ height: 52, width: "auto", display: "block" }}
            />
          </Link>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={WHATSAPP_GENERAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B3F6B] transition-colors hover:text-[#407EC9]"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <a
              href={EMAIL}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B3F6B] transition-colors hover:text-[#407EC9]"
            >
              <Mail className="h-4 w-4" /> ubicar.rent@gmail.com
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Ubicar Rent · Bahía Blanca, Argentina</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {/* Alcanzables desde acá y no sólo desde la portada: el paso 3 pide
                aceptarlos, y mandar a alguien a buscarlos a otra pantalla en
                mitad del flujo es perderlo. Se abren en pestaña nueva por lo
                mismo — volver atrás con el navegador reiniciaría el hold. */}
            <a
              href="/terminos"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Términos y condiciones
            </a>
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Política de privacidad
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function Tranquilidad({
  icono, titulo, texto,
}: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-[#407EC9]">{icono}</span>
      <div>
        <p className="text-sm font-semibold text-[#1B3F6B]">{titulo}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}
