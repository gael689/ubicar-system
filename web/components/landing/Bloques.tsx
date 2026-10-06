import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Icono } from "@/components/landing/Iconos";
import { FondoHero } from "@/components/landing/HeroSub";
import { BotonWhatsApp } from "@/components/landing/BotonWhatsApp";
import { EscaleraFaq } from "@/components/faq/EscaleraFaq";
import { PlazoFaq } from "@/components/faq/PlazoFaq";
import { DescuentoPagoTotalFaq } from "@/components/faq/DescuentoPagoTotalFaq";
import type { Pregunta } from "@/lib/faq";
import type { Categoria, NombreIcono, Paso, Punto } from "@/lib/landings";

/**
 * Los bloques con los que se arman las subpáginas. Todos son de servidor y se
 * renderizan completos en el HTML (nada se trae al hacer clic), así lo que dicen
 * lo ve el buscador.
 */

function Titulo({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight text-[#1B3F6B] md:text-4xl">{children}</h2>
      {sub && <p className="mt-3 text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Tarjetas con ícono, **montadas sobre el borde del hero** para que la página no
 *  arranque con un corte seco. */
export function Puntos({ puntos }: { puntos: Punto[] }) {
  return (
    <section className="relative z-20 -mt-16 pb-4 lg:-mt-20">
      <div className="container px-4">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {puntos.map((p) => (
            <li
              key={p.titulo}
              className="rounded-2xl border border-border/60 bg-white p-5 shadow-[0_10px_30px_-12px_rgba(15,28,46,0.25)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#407EC9]/12 text-[#407EC9]">
                <Icono nombre={p.icono} className="h-5 w-5" />
              </span>
              <p className="mt-4 font-semibold leading-snug text-[#1B3F6B]">{p.titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.detalle}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Las categorías, con su foto. `conBoton` lleva de vuelta al buscador. */
export function Categorias({
  categorias, conBoton, titulo = "Elegí tu categoría", sub,
}: {
  categorias: Categoria[];
  conBoton?: boolean;
  titulo?: string;
  sub?: string;
}) {
  const unica = categorias.length === 1;
  return (
    <section className="py-16 md:py-20">
      <div className="container px-4">
        <Titulo sub={sub ?? "Reservás una categoría, no un modelo: el modelo exacto se confirma al retirar."}>
          {titulo}
        </Titulo>
        <ul
          className={
            "mx-auto grid gap-6 " +
            (unica
              ? "max-w-md"
              : categorias.length === 2
                ? "max-w-3xl sm:grid-cols-2"
                : "sm:grid-cols-2 lg:grid-cols-3")
          }
        >
          {categorias.map((c) => (
            <li
              key={c.titulo}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm transition-shadow hover:shadow-xl"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-[#0F1C2E]">
                <Image
                  src={c.imagen}
                  alt={c.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                <p className="absolute bottom-3 left-4 text-lg font-bold text-white">{c.titulo}</p>
              </div>
              <div className="p-5">
                <ul className="flex flex-wrap gap-2">
                  {c.datos.map((d) => (
                    <li key={d} className="rounded-full bg-[#407EC9]/10 px-3 py-1 text-xs font-semibold text-[#1B3F6B]">
                      {d}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">{c.ejemplo}</p>
                {conBoton && (
                  <a
                    href="#reservar"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#407EC9] hover:underline"
                  >
                    Ver disponibilidad y precio <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Tres pasos, numerados. */
export function Pasos({ pasos, titulo = "Cómo funciona" }: { pasos: Paso[]; titulo?: string }) {
  return (
    <section className="bg-muted/30 py-16 md:py-20">
      <div className="container px-4">
        <Titulo>{titulo}</Titulo>
        <ol className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {pasos.map((p, i) => (
            <li key={p.titulo} className="relative rounded-2xl border border-border/60 bg-white p-6 pt-8 shadow-sm">
              <span className="absolute -top-4 left-6 flex h-9 w-9 items-center justify-center rounded-full bg-[#1B3F6B] text-sm font-bold text-white shadow-md">
                {i + 1}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#407EC9]/12 text-[#407EC9]">
                <Icono nombre={p.icono} className="h-5 w-5" />
              </span>
              <p className="mt-4 text-lg font-semibold text-[#1B3F6B]">{p.titulo}</p>
              {p.detalle && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.detalle}</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** La escalera de descuentos por días, con los números vivos del sistema. */
export function Escalera() {
  return (
    <section className="bg-muted/30 py-16 md:py-20">
      <div className="container px-4">
        <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[#1B3F6B] md:text-4xl">
              Cuanto más días, menos por día
            </h2>
            <p className="mt-3 text-muted-foreground">
              El descuento sube con la duración del alquiler, y no hay que pedirlo.
            </p>
          </div>
          {/* La tabla trae su propio marco y no se muestra si el sistema no
              responde: un recuadro mío alrededor quedaría vacío. */}
          <div className="[&>div]:mt-0 [&>div]:bg-white [&>div]:shadow-sm">
            <EscaleraFaq />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Las preguntas, en dos columnas: el título a un lado y el listado al otro. */
export function Preguntas({ preguntas }: { preguntas: Pregunta[] }) {
  return (
    <section className="py-16 md:py-20">
      <div className="container px-4">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[#1B3F6B] md:text-4xl">
              Preguntas frecuentes
            </h2>
            <p className="mt-3 text-muted-foreground">Lo que más nos preguntan antes de reservar.</p>
            <Link
              href="/preguntas-frecuentes"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#407EC9] hover:underline"
            >
              Ver todas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {preguntas.map((p) => (
              <details
                key={p.id}
                className="group rounded-xl border border-border/70 bg-white px-5 py-4 shadow-sm open:shadow-md [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#1B3F6B]">
                  {p.pregunta}
                  <svg
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="mt-3">
                  {p.respuesta.map((parrafo, i) => (
                    <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">{parrafo}</p>
                  ))}
                  {p.conEscalera && <EscaleraFaq />}
                  {p.conPlazo && <PlazoFaq />}
                  {p.conPagoTotal && <DescuentoPagoTotalFaq />}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export interface Enlace {
  href: string;
  nombre: string;
  icono?: NombreIcono;
  imagen?: string;
}

/** Tarjetas para seguir recorriendo el sitio. */
export function Enlaces({ enlaces, titulo = "Más para alquilar" }: { enlaces: Enlace[]; titulo?: string }) {
  return (
    <section className="bg-muted/30 py-16 md:py-20">
      <div className="container px-4">
        <Titulo>{titulo}</Titulo>
        {/* Con flex y no con grilla: cuando sobra una tarjeta queda centrada en
            vez de huérfana contra el borde izquierdo. */}
        <ul className="mx-auto flex max-w-5xl flex-wrap justify-center gap-4">
          {enlaces.map((e) => (
            <li key={e.href} className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)]">
              <Link
                href={e.href}
                className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#407EC9]/50 hover:shadow-lg"
              >
                {e.imagen ? (
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#0F1C2E]">
                    <Image src={e.imagen} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#407EC9]/12 text-[#407EC9]">
                    {e.icono && <Icono nombre={e.icono} className="h-6 w-6" />}
                  </span>
                )}
                <span className="flex-1 font-semibold text-[#1B3F6B]">{e.nombre}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[#407EC9]" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** El cierre: el mismo fondo del hero, para que la página empiece y termine igual. */
export function Cierre({
  titulo = "¿Lo reservamos?", detalle, mensaje, origen, reservar = true,
}: {
  titulo?: string;
  detalle: string;
  mensaje: string;
  origen: string;
  /** Si la página se reserva online, ofrece el botón. */
  reservar?: boolean;
}) {
  return (
    <section className="relative overflow-hidden py-20">
      <FondoHero />
      <div className="container relative z-10 px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{titulo}</h2>
        <p className="mx-auto mt-3 max-w-lg text-white/75">{detalle}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {reservar && (
            <Link
              href="/reservar"
              className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Reservar online
            </Link>
          )}
          <BotonWhatsApp mensaje={mensaje} origen={origen} claro />
        </div>
      </div>
    </section>
  );
}
