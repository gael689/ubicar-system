"use client";

import { TrendingDown } from "lucide-react";
import type { EscalonDuracion } from "@/lib/types";

interface Props {
  escalones: EscalonDuracion[];
  /** Días del alquiler que el cliente eligió. 0 = todavía no eligió fechas. */
  dias: number;
  /** Se llama con la nueva fecha de fin cuando el cliente acepta el empujón. */
  onEstirar?: (diasNuevos: number) => void;
}

/**
 * "Un día más y ahorrás 10%."
 *
 * El descuento por duración **ya lo aplica el backend solo**. El problema no es
 * calcularlo, es que el cliente se entera después: cambia las fechas por otro
 * motivo, ve que el total bajó, y para entonces ya decidió. Este bloque lo dice
 * antes, en el único momento en que todavía puede cambiar de idea.
 *
 * Muestra **un solo escalón**: el próximo. Una tabla con los cuatro tramos es
 * información de referencia y va en Preguntas frecuentes; acá lo que mueve la
 * aguja es un número concreto y una acción.
 */
export function AhorroPorDuracion({ escalones, dias, onEstirar }: Props) {
  if (!escalones.length || dias <= 0) return null;

  const actual = escalones.find(
    (e) => dias >= e.dias_desde && (e.dias_hasta === null || dias <= e.dias_hasta),
  );
  const porcentajeActual = actual?.porcentaje ?? 0;

  // El próximo escalón que mejora lo que ya tiene. Se busca por porcentaje y no
  // por posición: una escalera mal cargada puede tener un tramo que descuenta
  // menos que el anterior, y ofrecerle al cliente "alargá y ahorrá −5%" sería
  // peor que no decir nada.
  const proximo = escalones
    .filter((e) => e.dias_desde > dias && e.porcentaje > porcentajeActual)
    .sort((a, b) => a.dias_desde - b.dias_desde)[0];

  if (!proximo) {
    if (porcentajeActual <= 0) return null;
    return (
      <p className="flex items-center gap-2 rounded-lg border border-[hsl(var(--ubicar-green))]/30 bg-[hsl(var(--ubicar-green))]/10 px-3 py-2 text-sm">
        <TrendingDown className="h-4 w-4 shrink-0 text-[hsl(var(--ubicar-green))]" />
        <span className="text-foreground">
          Estás aprovechando <strong>{porcentajeActual}% de descuento</strong> por
          alquilar {dias} días.
        </span>
      </p>
    );
  }

  const faltan = proximo.dias_desde - dias;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[hsl(var(--ubicar-green))]/30 bg-[hsl(var(--ubicar-green))]/10 px-3 py-2 text-sm">
      <TrendingDown className="h-4 w-4 shrink-0 text-[hsl(var(--ubicar-green))]" />
      <span className="min-w-0 flex-1 text-foreground">
        {faltan === 1 ? "Un día más" : `${faltan} días más`} y el precio por día baja{" "}
        <strong>{proximo.porcentaje}%</strong>
        {porcentajeActual > 0 && (
          <span className="text-muted-foreground"> (hoy tenés {porcentajeActual}%)</span>
        )}
        .
      </span>
      {onEstirar && (
        <button
          type="button"
          onClick={() => onEstirar(proximo.dias_desde)}
          className="shrink-0 rounded-md border border-[hsl(var(--ubicar-green))] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--ubicar-green))] transition-colors hover:bg-[hsl(var(--ubicar-green))] hover:text-white"
        >
          Alquilar {proximo.dias_desde} días
        </button>
      )}
    </div>
  );
}
