import type { Metadata } from "next";
import { OG_IMAGEN } from "@/lib/sitio";
import { PaginaLegal } from "@/components/legales/PaginaLegal";
import { TERMINOS, VERSION_TERMINOS, VIGENTE_DESDE } from "@/lib/legales";

export const metadata: Metadata = {
  title: "Términos y condiciones | Ubicar Rent",
  description:
    "Condiciones de alquiler de vehículos de Ubicar Rent: reserva, pago, cancelación, requisitos del conductor, coberturas y kilometraje.",
  alternates: { canonical: "/terminos" },
  // Sin esto heredaba el Open Graph de la portada: compartida por WhatsApp se
  // veía con el título y la URL de la home (14/10).
  openGraph: {
    type: "website",
    url: "/terminos",
    title: "Términos y condiciones | Ubicar Rent",
    description:
    "Condiciones de alquiler de vehículos de Ubicar Rent: reserva, pago, cancelación, requisitos del conductor, coberturas y kilometraje.",
    images: [OG_IMAGEN],
    locale: "es_AR",
    siteName: "Ubicar Rent",
  },
  twitter: { card: "summary_large_image", title: "Términos y condiciones | Ubicar Rent", images: [OG_IMAGEN] },
};

export default function TerminosPage() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      bajada="Las condiciones que aplican a las reservas y alquileres hechos a través de este sitio."
      version={VERSION_TERMINOS}
      vigenteDesde={VIGENTE_DESDE}
      secciones={TERMINOS}
    />
  );
}
