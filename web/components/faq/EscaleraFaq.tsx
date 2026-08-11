"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { EscalonDuracion } from "@/lib/types";

/**
 * La escalera de descuentos, con los números vivos del sistema.
 *
 * **No se escriben los porcentajes en el código.** Se cargan desde Precios y
 * cambian: un "15%" pisado en la FAQ es una promesa que un día deja de ser
 * cierta y que nadie se acuerda de venir a corregir. El texto de la respuesta
 * explica el mecanismo, que no cambia; esta tabla trae los valores de hoy.
 *
 * Si `/public/config` no responde, no se muestra nada: la respuesta de arriba
 * sigue siendo verdadera sin la tabla, y una tabla vacía o con "—" haría dudar
 * de que el descuento exista.
 */
export function EscaleraFaq() {
  const [escalones, setEscalones] = useState<EscalonDuracion[] | null>(null);

  useEffect(() => {
    api
      .config()
      .then((c) => setEscalones(c.escalones_duracion ?? []))
      .catch(() => setEscalones([]));
  }, []);

  if (!escalones?.length) return null;

  const primero = escalones[0];

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Cuántos días</th>
            <th className="px-4 py-2 text-right font-medium">Descuento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {primero.dias_desde > 1 && (
            <tr>
              <td className="px-4 py-2 text-muted-foreground">
                {primero.dias_desde === 2 ? "1 día" : `1 a ${primero.dias_desde - 1} días`}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground">precio de lista</td>
            </tr>
          )}
          {escalones.map((e) => (
            <tr key={e.dias_desde}>
              <td className="px-4 py-2 text-foreground">
                {e.dias_hasta === null
                  ? `${e.dias_desde} días o más`
                  : `${e.dias_desde} a ${e.dias_hasta} días`}
              </td>
              <td className="px-4 py-2 text-right">
                <span className="rounded bg-[hsl(var(--ubicar-green))] px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
                  −{e.porcentaje}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        El descuento corre sobre el alquiler del vehículo. Los seguros y extras se
        suman aparte.
      </p>
    </div>
  );
}
