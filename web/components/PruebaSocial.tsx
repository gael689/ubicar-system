"use client";

import type { ReactNode } from "react";
import { clicExterno } from "@/lib/analitica";
import { INSTAGRAM } from "@/lib/constants";
import { RESENAS_GOOGLE, puntajeTexto, resenasTextoAccesible } from "@/lib/resenas";
import { cn } from "@/lib/utils";

/**
 * La prueba social del sitio: la insignia de reseñas de Google y el botón de
 * Instagram.
 *
 * Son cliente sólo por el `onClick` que mide el clic (`clicExterno`). Todo lo
 * que muestran sale de `lib/resenas.ts` y `lib/contacto.ts`: acá no hay ningún
 * número escrito.
 *
 * `tono` es sobre qué fondo van: `oscuro` para el hero (foto con velo) y
 * `claro` para las secciones blancas.
 */
type Tono = "oscuro" | "claro";

const FOCO =
  "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#7FB3E8]";

/** La "G" de Google, con sus colores. Decorativa: el texto ya dice "Google". */
function LogoGoogle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const ESTRELLA =
  "M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z";

/**
 * Cinco estrellas, pintadas hasta el puntaje (4,9 deja la quinta casi llena).
 * El ancho es fijo, así que no mueven nada al cargar.
 */
function Estrellas({ tono }: { tono: Tono }) {
  const lleno = Math.max(0, Math.min(100, (RESENAS_GOOGLE.puntaje / 5) * 100));
  const fila = (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d={ESTRELLA} />
        </svg>
      ))}
    </>
  );
  return (
    <span className="relative inline-flex w-20 shrink-0" aria-hidden="true">
      <span className={cn("flex", tono === "oscuro" ? "text-white/25" : "text-[#1B3F6B]/15")}>
        {fila}
      </span>
      <span
        className="absolute inset-y-0 left-0 flex overflow-hidden text-[#FBBC04]"
        style={{ width: `${lleno}%` }}
      >
        {fila}
      </span>
    </span>
  );
}

/**
 * La insignia de reseñas de Google: estrellas, puntaje y cantidad, y lleva a
 * la ficha para que cualquiera las pueda leer.
 *
 * **Sin cantidad cargada no muestra ningún número** (ver `lib/resenas.ts`).
 */
export function InsigniaResenas({
  origen, tono = "oscuro", className,
}: {
  /** Desde qué bloque se tocó, para la medición. */
  origen: string;
  tono?: Tono;
  className?: string;
}) {
  const { cantidad, url } = RESENAS_GOOGLE;
  const oscuro = tono === "oscuro";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => clicExterno("resenas_google", origen)}
      aria-label={resenasTextoAccesible()}
      className={cn(
        "group inline-flex min-h-[48px] items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left transition-colors",
        FOCO,
        oscuro
          ? "border-white/20 bg-white/10 backdrop-blur-sm hover:bg-white/[0.16] focus-visible:ring-offset-[#0B1422]"
          : "border-border bg-white hover:border-[#407EC9]/50 hover:bg-[#407EC9]/[0.04] focus-visible:ring-offset-white",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white">
        <LogoGoogle className="h-4 w-4" />
      </span>
      <span className="flex flex-col gap-0.5 leading-tight">
        <span className="flex items-center gap-1.5">
          <Estrellas tono={tono} />
          {cantidad !== null && (
            <span className={cn("text-sm font-bold tabular-nums", oscuro ? "text-white" : "text-[#1B3F6B]")}>
              {puntajeTexto(true)}
            </span>
          )}
        </span>
        <span className={cn("text-xs", oscuro ? "text-white/80" : "text-[#1B3F6B]/75")}>
          {cantidad !== null
            ? `${cantidad.toLocaleString("es-AR")} reseñas en Google`
            : `${puntajeTexto()} estrellas en Google`}
          <span aria-hidden="true"> · </span>
          <span className="underline underline-offset-2">
            Ver reseñas
          </span>
        </span>
      </span>
    </a>
  );
}

function LogoInstagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * El botón de Instagram. **Secundario a propósito**: contorno, sin relleno,
 * para que no le dispute el clic al botón de reservar. En pantallas angostas
 * queda sólo el ícono (con su `aria-label`) y entra al lado de la insignia.
 */
export function BotonInstagram({
  origen, tono = "oscuro", className,
}: {
  origen: string;
  tono?: Tono;
  className?: string;
}) {
  const oscuro = tono === "oscuro";
  return (
    <a
      href={INSTAGRAM}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => clicExterno("instagram", origen)}
      aria-label="Seguinos en Instagram (se abre en otra pestaña)"
      className={cn(
        "inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors sm:px-4",
        FOCO,
        oscuro
          ? "border-white/20 text-white/90 hover:bg-white/10 hover:text-white focus-visible:ring-offset-[#0B1422]"
          : "border-border text-[#1B3F6B] hover:border-[#407EC9]/50 hover:text-[#407EC9] focus-visible:ring-offset-white",
        className,
      )}
    >
      <LogoInstagram className="h-5 w-5 shrink-0" />
      <span className="hidden sm:inline">Seguinos en Instagram</span>
    </a>
  );
}

/**
 * Un enlace de texto a Instagram o a las reseñas, medido igual que los
 * botones. Para el pie, que es de servidor y no puede llevar `onClick`.
 */
export function EnlaceSocial({
  destino, origen, className, children,
}: {
  destino: "instagram" | "resenas_google";
  origen: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={destino === "instagram" ? INSTAGRAM : RESENAS_GOOGLE.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => clicExterno(destino, origen)}
      className={className}
    >
      {children}
    </a>
  );
}

export { LogoInstagram };
