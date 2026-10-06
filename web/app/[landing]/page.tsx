import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlantillaLanding from "@/components/landing/PlantillaLanding";
import { LANDINGS, landingPorSlug } from "@/lib/landings";

/**
 * Las páginas de servicio (`lib/landings.ts`). Se generan todas en el build y
 * un slug que no está en la lista da 404: nada se genera al pedirlo.
 *
 * Las rutas fijas (`/reservar`, `/maquinaria`, `/terminos`…) tienen prioridad
 * sobre este segmento dinámico; `SLUGS_RESERVADOS` impide que una landing use
 * uno de esos nombres y quede tapada.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return LANDINGS.map((l) => ({ landing: l.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ landing: string }> },
): Promise<Metadata> {
  const { landing: slug } = await params;
  const l = landingPorSlug(slug);
  if (!l) return {};
  return {
    title: l.titulo,
    description: l.descripcion,
    alternates: { canonical: `/${l.slug}` },
    openGraph: {
      type: "website",
      url: `/${l.slug}`,
      title: l.titulo,
      description: l.descripcion,
      images: ["/og-image.jpeg"],
      locale: "es_AR",
      siteName: "Ubicar Rent",
    },
    twitter: { card: "summary_large_image", title: l.titulo, description: l.descripcion, images: ["/og-image.jpeg"] },
  };
}

export default async function Page({ params }: { params: Promise<{ landing: string }> }) {
  const { landing: slug } = await params;
  const l = landingPorSlug(slug);
  if (!l) notFound();
  return <PlantillaLanding landing={l} />;
}
