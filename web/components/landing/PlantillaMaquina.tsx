import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import { BotonWhatsApp } from "@/components/landing/BotonWhatsApp";
import { MAQUINAS, type Maquina } from "@/lib/maquinas";
import { SITE } from "@/lib/sitio";

/**
 * La página de un equipo de maquinaria. La maquinaria no se reserva online: la
 * salida es WhatsApp, así que no hay buscador. Todo sale de `lib/maquinas.ts`.
 *
 * El JSON-LD es un `BreadcrumbList` y un `Product` sin precio (no hay uno
 * público que afirmar).
 */
export default function PlantillaMaquina({ maquina }: { maquina: Maquina }) {
  const url = `${SITE}/maquinaria/${maquina.slug}`;
  const otras = MAQUINAS.filter((m) => m.slug !== maquina.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Maquinaria", item: `${SITE}/maquinaria` },
          { "@type": "ListItem", position: 3, name: maquina.nombreCorto, item: url },
        ],
      },
      {
        "@type": "Product",
        "@id": `${url}#producto`,
        name: maquina.nombre,
        description: maquina.descripcion,
        image: `${SITE}${maquina.imagen}`,
        url,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main>
        <section className="bg-[#0F1C2E] pb-14 pt-32 lg:pb-20 lg:pt-36">
          <div className="container px-4">
            <nav aria-label="Ubicación en el sitio" className="mb-6 text-sm text-white/60">
              <Link href="/" className="hover:text-white">Inicio</Link>
              <span className="mx-2" aria-hidden="true">›</span>
              <Link href="/maquinaria" className="hover:text-white">Maquinaria</Link>
              <span className="mx-2" aria-hidden="true">›</span>
              <span className="text-white/90">{maquina.nombreCorto}</span>
            </nav>

            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <h1 className="text-[2rem] font-bold leading-[1.1] tracking-tight text-white sm:text-[2.6rem] lg:text-[3rem]">
                  Alquiler de {maquina.nombreCorto.toLowerCase()} en Bahía Blanca
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
                  Ubicar Rent alquila la {maquina.nombre} en Bahía Blanca y la zona.{" "}
                  {maquina.descripcion}
                </p>
                <div className="mt-8">
                  <BotonWhatsApp mensaje={maquina.waMsg} origen={`maquinaria-${maquina.slug}`} claro />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl" style={{ aspectRatio: "4/3" }}>
                <Image
                  src={maquina.imagen}
                  alt={maquina.imagenAlt}
                  width={800}
                  height={600}
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-14">
          <div className="container max-w-3xl px-4">
            <h2 className="text-2xl font-bold text-[#1B3F6B] md:text-3xl">Ficha técnica</h2>
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {maquina.specs.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-white px-4 py-3">
                  <dt className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-[#0F1C2E]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="bg-muted/30 py-12 md:py-14">
          <div className="container max-w-3xl px-4">
            <h2 className="text-2xl font-bold text-[#1B3F6B] md:text-3xl">Para qué se usa</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
              {maquina.usos.map((u) => <li key={u}>{u}</li>)}
            </ul>
            <p className="mt-6 text-muted-foreground">
              Consultá disponibilidad y precio por WhatsApp: la maquinaria no se reserva online.
            </p>
          </div>
        </section>

        <section className="py-12 md:py-14">
          <div className="container max-w-3xl px-4">
            <h2 className="text-xl font-bold text-[#1B3F6B]">Otros equipos</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {otras.map((m) => (
                <li key={m.slug}>
                  <Link
                    href={`/maquinaria/${m.slug}`}
                    className="block rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-[#1B3F6B] transition-colors hover:border-primary hover:text-primary"
                  >
                    {m.nombre} →
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/alquiler-camionetas-4x4-bahia-blanca"
                  className="block rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-[#1B3F6B] transition-colors hover:border-primary hover:text-primary"
                >
                  Camionetas 4x4 →
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
