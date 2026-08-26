import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { EscaleraFaq } from "@/components/faq/EscaleraFaq";
import { PlazoFaq } from "@/components/faq/PlazoFaq";
import { DescuentoPagoTotalFaq } from "@/components/faq/DescuentoPagoTotalFaq";
import { FAQ, TODAS_LAS_PREGUNTAS } from "@/lib/faq";
import { WHATSAPP_GENERAL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Preguntas frecuentes | Ubicar Rent",
  description:
    "Requisitos para alquilar un auto en Bahía Blanca, edad del conductor, seña y cancelación, kilometraje libre, franquicia, formas de pago y cómo se firma el contrato.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

/**
 * Preguntas frecuentes.
 *
 * **Es la página con más potencial de búsqueda del sitio.** La gente no busca
 * "alquiler de autos Bahía Blanca" cuando ya decidió: busca "necesito tarjeta
 * de crédito para alquilar un auto" o "hasta qué edad se puede alquilar". Cada
 * pregunta redactada como la escribiría una persona es una puerta de entrada.
 *
 * Por eso va con `FAQPage` en JSON-LD: es lo que habilita que Google muestre
 * las preguntas desplegables debajo del resultado. El JSON-LD se arma del
 * **mismo array** que se renderiza, no de una copia — un structured data que
 * dice algo distinto de lo que se ve en la página es una penalización, no una
 * ayuda.
 *
 * Todo se renderiza en el servidor y las respuestas están abiertas en el HTML:
 * un acordeón que carga el texto al hacer clic no lo ve el buscador ni lo
 * encuentra el Ctrl+F del visitante.
 */
export default function PreguntasFrecuentesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: TODAS_LAS_PREGUNTAS.map((p) => ({
      "@type": "Question",
      name: p.pregunta,
      acceptedAnswer: { "@type": "Answer", text: p.respuesta.join(" ") },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />

      <main className="bg-muted/30 py-12 md:py-16">
        <div className="container max-w-3xl">
          <header className="mb-10">
            <h1 className="text-3xl font-bold text-[#1B3F6B] md:text-4xl">
              Preguntas frecuentes
            </h1>
            <p className="mt-2 text-muted-foreground">
              Lo que más nos preguntan antes de alquilar. Si te queda una duda que
              no está acá, escribinos y te contestamos.
            </p>
          </header>

          {/* Índice: con veinte preguntas, bajar scrolleando es peor que
              elegir. Son anclas reales, así que un link a una pregunta puntual
              se puede compartir. */}
          <nav className="mb-10 rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ir directo a
            </p>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {TODAS_LAS_PREGUNTAS.map((p) => (
                <a
                  key={p.id}
                  href={`#${p.id}`}
                  className="text-sm text-[#1B3F6B] underline-offset-2 hover:underline"
                >
                  {p.pregunta}
                </a>
              ))}
            </div>
          </nav>

          <div className="space-y-10">
            {FAQ.map((grupo) => (
              <section key={grupo.titulo}>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {grupo.titulo}
                </h2>
                <div className="space-y-4">
                  {grupo.preguntas.map((p) => (
                    <article
                      key={p.id}
                      id={p.id}
                      className="scroll-mt-24 rounded-lg border border-border bg-white p-5 shadow-sm"
                    >
                      <h3 className="font-semibold text-[#1B3F6B]">{p.pregunta}</h3>
                      {p.respuesta.map((parrafo, i) => (
                        <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {parrafo}
                        </p>
                      ))}
                      {p.conEscalera && <EscaleraFaq />}
                      {p.conPlazo && <PlazoFaq />}
                      {p.conPagoTotal && <DescuentoPagoTotalFaq />}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-lg border border-border bg-white p-6 text-center">
            <h2 className="font-semibold text-[#1B3F6B]">¿Te quedó una duda?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escribinos y te contestamos. También podés ver los{" "}
              <Link href="/terminos" className="underline underline-offset-2">
                términos y condiciones
              </Link>{" "}
              completos.
            </p>
            <a
              href={WHATSAPP_GENERAL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-[hsl(var(--ubicar-green))] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" /> Escribinos por WhatsApp
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
