import { Suspense } from "react";
import type { Metadata } from "next";
import { Confirmacion } from "@/components/reservar/Confirmacion";

export const metadata: Metadata = {
  title: "Reserva confirmada | Ubicar Rent",
  // No se indexa: es el final de un flujo transaccional y las URLs llevan
  // datos de una operación concreta.
  robots: { index: false, follow: false },
};

export default function ListoPage() {
  // `useSearchParams` exige un límite de Suspense en el App Router (Next 16).
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/30" />}>
      <Confirmacion />
    </Suspense>
  );
}
