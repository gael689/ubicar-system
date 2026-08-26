import Link from "next/link";
import { EscaleraFaq } from "@/components/faq/EscaleraFaq";
import { PlazoFaq } from "@/components/faq/PlazoFaq";
import { PREGUNTAS_DESTACADAS, TODAS_LAS_PREGUNTAS } from "@/lib/faq";

/**
 * Las preguntas que frenan una reserva, en la portada.
 *
 * **Era el mayor agujero de conversión del sitio.** `lib/faq.ts` es el mejor
 * contenido que hay —respuestas concretas a lo que realmente detiene a alguien:
 * qué necesito para retirar, desde qué edad, qué es la franquicia— y estaba
 * enlazado únicamente desde el footer. Una duda sin responder antes del
 * formulario no se convierte en una consulta: se convierte en una pestaña que
 * se cierra.
 *
 * Tres decisiones que no son de estilo:
 *
 * 1. **Sale del mismo `lib/faq.ts`**, filtrado por `destacada`. No es una copia
 *    de los textos: si mañana cambia la política de cancelación se toca un
 *    lugar y cambian la portada y la página completa a la vez. Dos copias del
 *    mismo texto legal es cómo se termina prometiendo dos cosas distintas.
 *
 * 2. **`<details>` y no un acordeón de React.** Las respuestas están **en el
 *    HTML servido**, abiertas para el buscador y para el Ctrl+F del visitante;
 *    `<details>` sólo las pliega visualmente. Un acordeón que trae el texto al
 *    hacer clic no lo ve Google ni lo encuentra quien busca en la página. Es el
 *    mismo criterio que ya documenta la página de FAQ.
 *
 * 3. **No emite JSON-LD.** El `FAQPage` del sitio es uno solo y vive en
 *    `/preguntas-frecuentes`. Emitirlo también acá sería repetir exactamente el
 *    problema que se acaba de sacar del layout raíz: dos entidades `FAQPage`
 *    compitiendo, que Google suele resolver ignorando las dos.
 */
export default function FaqSection() {
  return (
    <section id="preguntas" className="bg-muted/30 py-20 md:py-24">
      <div className="container max-w-3xl">
        <header className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-[#1B3F6B] md:text-4xl">
            Antes de reservar
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Lo que más nos preguntan. Si te queda una duda que no está acá,
            escribinos y te contestamos.
          </p>
        </header>

        <div className="space-y-3">
          {PREGUNTAS_DESTACADAS.map((p) => (
            <details
              key={p.id}
              className="group rounded-lg border border-border bg-white px-5 py-4 shadow-sm [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#1B3F6B]">
                {p.pregunta}
                {/* El chevron rota al abrir. Va inline y no como ícono de
                    lucide para que esta sección siga siendo un componente de
                    servidor: no necesita JavaScript para funcionar. */}
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
              </div>
            </details>
          ))}
        </div>

        <p className="mt-8 text-center">
          <Link
            href="/preguntas-frecuentes"
            className="text-sm font-semibold text-[#407EC9] underline-offset-4 hover:underline"
          >
            Ver las {TODAS_LAS_PREGUNTAS.length} preguntas →
          </Link>
        </p>
      </div>
    </section>
  );
}
