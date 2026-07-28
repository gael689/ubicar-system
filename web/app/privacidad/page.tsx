import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legales/PaginaLegal";
import { PRIVACIDAD, VERSION_PRIVACIDAD, VIGENTE_DESDE } from "@/lib/legales";

export const metadata: Metadata = {
  title: "Política de privacidad | Ubicar Rent",
  description:
    "Qué datos personales recolecta Ubicar Rent, para qué los usa, con quién los comparte y cómo ejercer tus derechos (Ley 25.326).",
  alternates: { canonical: "/privacidad" },
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
