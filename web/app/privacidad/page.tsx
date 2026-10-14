import type { Metadata } from "next";
import { OG_IMAGEN } from "@/lib/sitio";
import { PaginaLegal } from "@/components/legales/PaginaLegal";
import { PRIVACIDAD, VERSION_PRIVACIDAD, VIGENTE_DESDE } from "@/lib/legales";

export const metadata: Metadata = {
  title: "Política de privacidad | Ubicar Rent",
  description:
    "Qué datos personales recolecta Ubicar Rent, para qué los usa, con quién los comparte y cómo ejercer tus derechos (Ley 25.326).",
  alternates: { canonical: "/privacidad" },
  // Sin esto heredaba el Open Graph de la portada: compartida por WhatsApp se
  // veía con el título y la URL de la home (14/10).
  openGraph: {
    type: "website",
    url: "/privacidad",
    title: "Política de privacidad | Ubicar Rent",
    description:
    "Qué datos personales recolecta Ubicar Rent, para qué los usa, con quién los comparte y cómo ejercer tus derechos (Ley 25.326).",
    images: [OG_IMAGEN],
    locale: "es_AR",
    siteName: "Ubicar Rent",
  },
  twitter: { card: "summary_large_image", title: "Política de privacidad | Ubicar Rent", images: [OG_IMAGEN] },
};

export default function PrivacidadPage() {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      bajada="Qué datos recolectamos, para qué los usamos y qué derechos tenés sobre ellos."
      version={VERSION_PRIVACIDAD}
      vigenteDesde={VIGENTE_DESDE}
      secciones={PRIVACIDAD}
    />
  );
}
