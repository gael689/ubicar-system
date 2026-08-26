"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { EscalonDuracion } from "@/lib/types";

/**
 * Qué gana el cliente pagando el 100 % por el sitio, con los números de hoy.
 *
 * **El beneficio no es un porcentaje extra: es que se destraba el descuento por
 * duración** (D-49). En la web el descuento por alquiler largo corre sólo si se
 * paga todo por adelantado; con el 30 % o el 50 % de seña se cobra precio de
 * lista. En el mostrador, en cambio, aplica siempre.
 *
 * Hay además un descuento adicional configurable por pago total
 * (`descuento_pago_total_pct`), **hoy en 0 %**. Cuando esté en cero no se
 * menciona: anunciar "0 % de descuento" es peor que no anunciar nada.
 *
 * Ninguno de los dos números se escribe acá. Los dos se cargan desde el sistema
 * y cambian — mismo criterio que `EscaleraFaq` y `PlazoFaq`. Un porcentaje
 * pisado en el código es una promesa que un día deja de ser cierta y que nadie
 * se acuerda de venir a corregir.
 */
export function DescuentoPagoTotalFaq() {
  const [datos, setDatos] = useState<{
    escalones: EscalonDuracion[];
    extra: number;
  } | null>(null);

  useEffect(() => {
    api
      .config()
      .then((c) =>
        setDatos({
          escalones: c.escalones_duracion ?? [],
          extra: Number(c.descuento_pago_total_pct ?? 0),
        }),
      )
      .catch(() => setDatos(null));
  }, []);

  if (!datos) return null;

  const { escalones, extra } = datos;
  const mayor = escalones.length
    ? Math.max(...escalones.map((e) => Number(e.porcentaje)))
    : 0;

  // Sin escalones cargados y sin descuento extra no hay nada que prometer, y
  // el párrafo de arriba sigue siendo verdadero sin esto.
  if (mayor <= 0 && extra <= 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-[hsl(var(--ubicar-green))]/30 bg-[hsl(var(--ubicar-green))]/5 px-4 py-3">
      <p className="text-sm font-semibold text-[#1B3F6B]">
        Pagando el 100% por el sitio
      </p>
      <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
        {mayor > 0 && (
          <li>
            Se aplica el descuento por cantidad de días, que llega hasta{" "}
            <strong className="text-[hsl(var(--ubicar-green))]">−{mayor}%</strong>.
            Con el 30% o el 50% se cobra el precio de lista.
          </li>
        )}
        {extra > 0 && (
          <li>
            Además, un{" "}
            <strong className="text-[hsl(var(--ubicar-green))]">−{extra}%</strong>{" "}
            extra por abonar todo por adelantado.
          </li>
        )}
      </ul>
    </div>
  );
}
