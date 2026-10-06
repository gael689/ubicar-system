import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import BuscadorReserva from "@/components/BuscadorReserva";
import { BotonWhatsApp } from "@/components/landing/BotonWhatsApp";
import { EscaleraFaq } from "@/components/faq/EscaleraFaq";
import { PlazoFaq } from "@/components/faq/PlazoFaq";
import { DescuentoPagoTotalFaq } from "@/components/faq/DescuentoPagoTotalFaq";
import { TODAS_LAS_PREGUNTAS, type Pregunta } from "@/lib/faq";
import { landingPorSlug, type Landing } from "@/lib/landings";
import { SITE } from "@/lib/sitio";

/**
 * La página de un servicio. Una puerta a `/reservar`, no un folleto: el
 * buscador está arriba, junto al texto que responde la búsqueda.
 *
 * Todo se renderiza en el servidor y las respuestas están abiertas en el HTML
 * (`<details>` sólo las pliega a la vista), igual que en `FaqSection`: un
 * acordeón que trae el texto al hacer clic no lo ve el buscador.
 *
 * **Las preguntas no llevan `FAQPage`**: ese marcado ya vive en
 * `/preguntas-frecuentes`, y repetir las mismas preguntas en varias páginas es
 * lo que se sacó del layout raíz. Acá se ven, sin marcado.
 *
 * El JSON-LD es un `BreadcrumbList` y un `Service` que apunta al negocio por su
 * `@id`, sin repetir el `AutoRental` del layout.
 */
export default function PlantillaLanding({ landing }: { landing: Landing }) {
  const preguntas: Pregunta[] = [
    ...(landing.preguntasPropias ?? []),
    ...landing.preguntasIds.map((id) => {
      const p = TODAS_LAS_PREGUNTAS.find((x) => x.id === id);
      // Un id mal escrito rompe el build en vez de dejar la pregunta afuera.
      if (!p) throw new Error(`"${landing.slug}" pide la pregunta "${id}", que no existe en lib/faq.ts.`);
      return p;
    }),
  ];
  const hermanas = landing.hermanas.map((s) => landingPorSlug(s)).filter((l): l is Landing => !!l);
  const url = `${SITE}/${landing.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: landing.nombre, item: url },
        ],
      },
      {
        "@type": "Service",
        "@id": `${url}#servicio`,
        name: landing.servicio.nombre,
        description: landing.servicio.descripcion,
        url,
        provider: { "@id": `${SITE}/#business` },
        areaServed: { "@type": "City", name: "Bahía Blanca" },
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
        {/* El Header es transparente con letras blancas hasta que se scrollea:
            la primera franja tiene que ser oscura. */}
        <section className="bg-[#0F1C2E] pb-14 pt-32 lg:pb-20 lg:pt-36">
          <div className="container px-4">
            <nav aria-label="Ubicación en el sitio" className="mb-6 text-sm text-white/60">
              <Link href="/" className="hover:text-white">Inicio</Link>
              <span className="mx-2" aria-hidden="true">›</span>
              <span className="text-white/90">{landing.nombre}</span>
            </nav>

            <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,470px)] lg:gap-14">
              <div>
                <h1 className="text-[2rem] font-bold leading-[1.1] tracking-tight text-white sm:text-[2.6rem] lg:text-[3rem]">
                  {landing.h1}
                </h1>
                <div className="mt-6 max-w-xl space-y-4 text-base leading-relaxed text-white/80 md:text-lg">
                  {landing.intro.map((p, i) => <p key={i}>{p}</p>)}
                </div>
                <div className="mt-8">
                  <BotonWhatsApp mensaje={landing.whatsapp} origen={landing.slug} claro />
                </div>
              </div>

              <BuscadorReserva lugarInicial={landing.lugarInicial} />
            </div>
          </div>
        </section>

        {landing.secciones.map((s) => (
          <section key={s.titulo} className="py-12 md:py-14 even:bg-muted/30">
            <div className="container max-w-3xl px-4">
              <h2 className="text-2xl font-bold text-[#1B3F6B] md:text-3xl">{s.titulo}</h2>
              <div className="mt-4 space-y-3 leading-relaxed text-muted-foreground">
                {s.parrafos.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>
          </section>
        ))}

        <section className="bg-muted/30 py-12 md:py-14">
          <div className="container max-w-3xl px-4">
            <h2 className="text-2xl font-bold text-[#1B3F6B] md:text-3xl">Preguntas frecuentes</h2>
            <div className="mt-6 space-y-3">
              {preguntas.map((p) => (
                <details
                  key={p.id}
                  className="group rounded-lg border border-border bg-white px-5 py-4 shadow-sm [&_summary::-webkit-details-marker]:hidden"
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
                      <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {parrafo}
                      </p>
                    ))}
                    {p.conEscalera && <EscaleraFaq />}
                    {p.conPlazo && <PlazoFaq />}
                    {p.conPagoTotal && <DescuentoPagoTotalFaq />}
                  </div>
                </details>
              ))}
            </div>
            <p className="mt-6 text-sm">
              <Link
                href="/preguntas-frecuentes"
                className="font-semibold text-[#407EC9] underline-offset-4 hover:underline"
              >
                Ver todas las preguntas →
              </Link>
            </p>
          </div>
        </section>

        {hermanas.length > 0 && (
          <section className="py-12 md:py-14">
            <div className="container max-w-3xl px-4">
              <h2 className="text-xl font-bold text-[#1B3F6B]">Más para alquilar</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {hermanas.map((h) => (
                  <li key={h.slug}>
                    <Link
                      href={`/${h.slug}`}
                      className="block rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-[#1B3F6B] transition-colors hover:border-primary hover:text-primary"
                    >
                      {h.nombre} →
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/maquinaria"
                    className="block rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-[#1B3F6B] transition-colors hover:border-primary hover:text-primary"
                  >
                    Maquinaria pesada →
                  </Link>
                </li>
              </ul>
            </div>
          </section>
        )}

        <section className="bg-[#0F1C2E] py-12 text-center">
          <div className="container max-w-2xl px-4">
            <h2 className="text-2xl font-bold text-white">¿Lo reservamos?</h2>
            <p className="mt-2 text-white/75">
              Reservá online con el precio final, o escribinos y lo coordinamos.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/reservar"
                className="inline-flex items-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Reservar online
              </Link>
              <BotonWhatsApp mensaje={landing.whatsapp} origen={landing.slug} claro />
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
