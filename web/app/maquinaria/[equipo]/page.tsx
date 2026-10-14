import type { Metadata } from "next";
import { OG_IMAGEN } from "@/lib/sitio";
import { notFound } from "next/navigation";
import PlantillaMaquina from "@/components/landing/PlantillaMaquina";
import { MAQUINAS, maquinaPorSlug } from "@/lib/maquinas";

/** Una página por equipo (`lib/maquinas.ts`); un slug desconocido da 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return MAQUINAS.map((m) => ({ equipo: m.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ equipo: string }> },
): Promise<Metadata> {
  const { equipo } = await params;
  const m = maquinaPorSlug(equipo);
  if (!m) return {};
  return {
    title: m.titulo,
    description: m.metaDescripcion,
    alternates: { canonical: `/maquinaria/${m.slug}` },
    openGraph: {
      type: "website",
      url: `/maquinaria/${m.slug}`,
      title: m.titulo,
      description: m.metaDescripcion,
      images: [OG_IMAGEN],
      locale: "es_AR",
      siteName: "Ubicar Rent",
    },
    twitter: { card: "summary_large_image", title: m.titulo, description: m.metaDescripcion, images: [OG_IMAGEN] },
  };
}

export default async function Page({ params }: { params: Promise<{ equipo: string }> }) {
  const { equipo } = await params;
  const m = maquinaPorSlug(equipo);
  if (!m) notFound();
  return <PlantillaMaquina maquina={m} />;
}
