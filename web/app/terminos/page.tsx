import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legales/PaginaLegal";
import { TERMINOS, VERSION_TERMINOS, VIGENTE_DESDE } from "@/lib/legales";

export const metadata: Metadata = {
  title: "Términos y condiciones | Ubicar Rent",
  description:
    "Condiciones de alquiler de vehículos de Ubicar Rent: reserva, pago, cancelación, requisitos del conductor, coberturas y kilometraje.",
  alternates: { canonical: "/terminos" },
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
