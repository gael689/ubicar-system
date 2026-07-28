import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import Footer from "@/components/Footer";
import type { SeccionLegal } from "@/lib/legales";

interface Props {
  titulo: string;
  bajada: string;
  version: number;
  vigenteDesde: string;
  secciones: SeccionLegal[];
}

/**
 * Maqueta compartida de los textos legales.
 *
 * Ancho de lectura acotado y tipografía cómoda: un texto legal que no se puede
 * leer es un texto legal que nadie lee, y después nadie puede decir que estaba
 * de acuerdo. El índice lateral existe porque a estas páginas se entra
 * buscando **una** cosa —casi siempre la cancelación—, no a leerlas enteras.
 */
export function PaginaLegal({ titulo, bajada, version, vigenteDesde, secciones }: Props) {
  const fecha = new Date(`${vigenteDesde}T00:00:00`).toLocaleDateString("es-AR", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <header className="border-b border-border bg-white">
        <div className="container py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
        </div>
      </header>

      <main className="bg-muted/30 py-10 md:py-14">
        <div className="container">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-2xl font-bold text-[#1B3F6B] md:text-3xl">{titulo}</h1>
            <p className="mt-2 text-muted-foreground">{bajada}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Versión {version} · Vigente desde el {fecha}
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-6xl gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            {/* Índice */}
            <nav className="hidden lg:block">
              <div className="sticky top-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contenido
                </p>
                <ul className="space-y-1.5 text-sm">
                  {secciones.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="text-muted-foreground transition-colors hover:text-primary"
                      >
                        {s.titulo}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>

            <article className="max-w-3xl space-y-8 rounded-lg border border-border bg-white p-6 md:p-9">
              {secciones.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-6">
                  <h2 className="mb-3 font-semibold text-[#1B3F6B]">{s.titulo}</h2>

                  <div className="space-y-3">
                    {s.parrafos.map((p, i) => (
                      <p key={i} className="text-sm leading-relaxed text-foreground/90">
                        {p}
                      </p>
                    ))}
                  </div>

                  {s.items && (
                    <ul className="mt-3 space-y-2">
                      {s.items.map((item, i) => (
                        <li
                          key={i}
                          className="flex gap-2.5 text-sm leading-relaxed text-foreground/90"
                        >
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Lo que falta definir se muestra, no se disimula: un dato
                      fiscal inventado es peor que un espacio en blanco. */}
                  {s.pendiente && (
                    <p className="mt-3 flex gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {s.pendiente}
                    </p>
                  )}
                </section>
              ))}
            </article>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
