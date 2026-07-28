import { Suspense } from "react";
import type { Metadata } from "next";
import { FlujoReserva } from "@/components/reservar/FlujoReserva";

export const metadata: Metadata = {
  title: "Reservá tu vehículo | Ubicar Rent",
  description:
    "Elegí fechas, vehículo y adicionales, y reservá tu alquiler en Bahía Blanca en cuatro pasos.",
  // El flujo es transaccional: no aporta nada en buscadores y no conviene que
  // se indexen URLs con fechas viejas.
  robots: { index: false, follow: true },
};

export default function ReservarPage() {
  // `useSearchParams` obliga a un límite de Suspense en el App Router: sin él,
  // toda la rama cliente se saca del prerender (Next 16).
  return (
    <Suspense fallback={<Cargando />}>
      <FlujoReserva />
    </Suspense>
  );
}

function Cargando() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="h-16 border-b border-border bg-white" />
      <div className="container py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className="h-32 animate-pulse rounded-lg bg-white" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-72 animate-pulse rounded-lg bg-white" />
              ))}
            </div>
          </div>
          <div className="hidden h-64 animate-pulse rounded-lg bg-white lg:block" />
        </div>
      </div>
    </div>
  );
}
