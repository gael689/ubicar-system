import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * El Hero de las subpáginas: **el mismo fondo que el de la portada** (la foto
 * del atardecer con el velo neutro), con un gancho y un título propios. Va más
 * bajo que el de la portada —no ocupa toda la pantalla— porque acá la gente ya
 * sabe qué busca.
 *
 * El `id="reservar"` es el destino de los botones "Ver disponibilidad" de las
 * tarjetas de abajo: llevan de vuelta al buscador.
 */
export const VELO_HERO =
  "linear-gradient(100deg, rgba(8,15,26,0.92) 0%, rgba(11,20,34,0.80) 40%, rgba(16,26,42,0.38) 100%)";

export function FondoHero({ priority = false }: { priority?: boolean }) {
  return (
    <>
      <Image
        src="/img/hero.jpg"
        alt=""
        fill
        priority={priority}
        sizes="100vw"
        className="object-cover object-[65%_center]"
      />
      <div className="absolute inset-0" style={{ background: VELO_HERO }} />
    </>
  );
}

export interface Miga {
  nombre: string;
  href?: string;
}

export default function HeroSub({
  migas, gancho, h1, bajada, acciones, derecha,
}: {
  migas: Miga[];
  /** La línea corta de arriba. */
  gancho: string;
  h1: string;
  bajada: string;
  /** Botones debajo de la bajada. */
  acciones?: ReactNode;
  /** El buscador, una tarjeta de contacto o una foto. */
  derecha: ReactNode;
}) {
  return (
    <section id="reservar" className="relative overflow-hidden pb-28 pt-32 lg:pb-32 lg:pt-40">
      <FondoHero priority />

      <div className="container relative z-10 px-4">
        <nav aria-label="Ubicación en el sitio" className="mb-8 text-sm text-white/60">
          <Link href="/" className="hover:text-white">Inicio</Link>
          {migas.map((m) => (
            <span key={m.nombre}>
              <span className="mx-2" aria-hidden="true">›</span>
              {m.href
                ? <Link href={m.href} className="hover:text-white">{m.nombre}</Link>
                : <span className="text-white/90">{m.nombre}</span>}
            </span>
          ))}
        </nav>

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)] lg:gap-14">
          <div>
            <p
              className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#7FB3E8] opacity-0 animate-fade-up"
              style={{ animationDelay: "0.08s" }}
            >
              {gancho}
            </p>
            <h1
              className="text-[2.1rem] font-bold leading-[1.08] tracking-tight text-white opacity-0 animate-fade-up sm:text-[2.8rem] lg:text-[3.3rem]"
              style={{ animationDelay: "0.14s" }}
            >
              {h1}
            </h1>
            <p
              className="mt-5 max-w-md text-base leading-relaxed text-white/75 opacity-0 animate-fade-up md:text-lg"
              style={{ animationDelay: "0.2s" }}
            >
              {bajada}
            </p>
            {acciones && (
              <div
                className="mt-8 flex flex-wrap items-center gap-3 opacity-0 animate-fade-up"
                style={{ animationDelay: "0.26s" }}
              >
                {acciones}
              </div>
            )}
          </div>

          <div
            className="opacity-0 animate-fade-up"
            style={{ animationDelay: "0.12s" }}
          >
            {derecha}
          </div>
        </div>
      </div>
    </section>
  );
}
