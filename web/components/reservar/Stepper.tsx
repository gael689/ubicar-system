"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const PASOS = [
  { n: 1, label: "Vehículo" },
  { n: 2, label: "Adicionales" },
  { n: 3, label: "Tus datos" },
  { n: 4, label: "Pago" },
] as const;

/**
 * Indicador de progreso.
 *
 * En mobile no se muestran los 4 pasos —no entran sin apretarlos hasta que
 * dejan de leerse— sino el actual con una barra de avance. Saber "voy 2 de 4"
 * es lo que baja el abandono; ver los nombres de los otros tres, no.
 */
export function Stepper({ actual }: { actual: number }) {
  return (
    <>
      {/* Desktop */}
      <ol className="hidden items-center gap-2 md:flex">
        {PASOS.map((paso, i) => {
          const completo = actual > paso.n;
          const activo = actual === paso.n;
          return (
            <li key={paso.n} className="flex items-center gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition-colors",
                    completo && "bg-primary text-primary-foreground",
                    activo && "bg-[#1B3F6B] text-white ring-4 ring-[#1B3F6B]/15",
                    !completo && !activo && "bg-muted text-muted-foreground",
                  )}
                >
                  {completo ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : paso.n}
                </span>
                <span
                  className={cn(
                    "text-sm transition-colors",
                    activo ? "font-semibold text-[#1B3F6B]" : "text-muted-foreground",
                  )}
                >
                  {paso.label}
                </span>
              </div>
              {i < PASOS.length - 1 && (
                <span
                  className={cn(
                    "mx-1 h-px w-8 lg:w-14",
                    completo ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile */}
      <div className="w-full md:hidden">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-[#1B3F6B]">
            {PASOS[actual - 1]?.label}
          </p>
          <p className="text-xs text-muted-foreground">Paso {actual} de {PASOS.length}</p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${(actual / PASOS.length) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}
