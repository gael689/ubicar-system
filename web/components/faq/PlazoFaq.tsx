"use client";

import { useEffect, useState } from "react";
import { api, textoPlazo } from "@/lib/api";

/**
 * La anticipación mínima con la que el sitio toma reservas, en vivo.
 *
 * **El número no se escribe en la FAQ.** Vive en `web.anticipacion_minima_horas`
 * y se edita desde Configuración; la respuesta decía "24 horas" y el sistema
 * rechazaba por debajo de 240 (10 días). O sea que la FAQ prometía diez veces
 * menos de lo que el buscador acepta, y el visitante se enteraba cuando el
 * formulario le rebotaba las fechas — que es el peor momento para enterarse.
 *
 * Mismo criterio que `EscaleraFaq` con los porcentajes de descuento: el texto
 * explica el mecanismo, que no cambia, y esto trae el valor de hoy.
 *
 * Si `/public/config` no responde no se muestra nada. La respuesta de arriba
 * sigue siendo verdadera sin el número, y un "—" haría dudar de que exista el
 * plazo.
 */
export function PlazoFaq() {
  const [horas, setHoras] = useState<number | null>(null);

  useEffect(() => {
    api
      .config()
      .then((c) => setHoras(c.anticipacion_minima_horas ?? null))
      .catch(() => setHoras(null));
  }, []);

  if (horas === null || horas <= 0) return null;

  // "10 días" y no "240 horas": nadie procesa un plazo en horas. Es la misma
  // función que usan el cartel de derivación y el aviso del buscador, así que
  // los tres dicen exactamente lo mismo.
  const texto =
    horas < 48
      ? `${horas} ${horas === 1 ? "hora" : "horas"}`
      : textoPlazo(Math.round(horas / 24), true);

  return (
    <p className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">Anticipación mínima hoy: </span>
      <strong className="text-[#1B3F6B]">{texto}</strong>
    </p>
  );
}
