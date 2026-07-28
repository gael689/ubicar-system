"use client";

import { CalendarDays, MapPin, Car } from "lucide-react";
import { pesos, fechaCorta } from "@/lib/api";
import type { Cotizacion } from "@/lib/types";
import type { RangoBusqueda } from "./BuscadorRango";

interface Props {
  rango: RangoBusqueda;
  categoriaNombre: string | null;
  cotizacion: Cotizacion | null;
  cargando?: boolean;
}

/**
 * El resumen que acompaña todo el flujo.
 *
 * **El total está siempre a la vista y es siempre el mismo número.** Un total
 * que aparece recién al final es la causa número uno de abandono en un
 * checkout: el cliente que ve el precio moverse deja de confiar.
 *
 * En desktop es una columna pegajosa; en mobile, la barra inferior del
 * contenedor la reemplaza para no comerse la pantalla.
 */
export function ResumenReserva({ rango, categoriaNombre, cotizacion, cargando }: Props) {
  return (
    <aside className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-[#1B3F6B]">Tu reserva</h2>

      <dl className="mt-4 space-y-3 text-sm">
        <Dato icono={MapPin} titulo="Retiro" valor={rango.lugarRetiro || "—"} />
        {rango.lugarDevolucion && rango.lugarDevolucion !== rango.lugarRetiro && (
          <Dato icono={MapPin} titulo="Devolución" valor={rango.lugarDevolucion} />
        )}
        <Dato
          icono={CalendarDays}
          titulo="Fechas"
          valor={
            rango.fechaInicio
              ? `${fechaCorta(rango.fechaInicio)} ${rango.horaInicio} → ${fechaCorta(rango.fechaFin)} ${rango.horaFin}`
              : "—"
          }
        />
        {categoriaNombre && <Dato icono={Car} titulo="Vehículo" valor={categoriaNombre} />}
      </dl>

      {cargando && (
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      )}

      {!cargando && cotizacion && (
        <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <Linea
            etiqueta={`Alquiler · ${cotizacion.duracion_dias} ${cotizacion.duracion_dias === 1 ? "día" : "días"}`}
            valor={pesos(cotizacion.subtotal)}
          />

          {cotizacion.descuento_monto > 0 && (
            <Linea
              etiqueta={cotizacion.descuento_nombre ?? "Descuento"}
              valor={`-${pesos(cotizacion.descuento_monto)}`}
              acento
            />
          )}

          {cotizacion.adicionales.map((a) => (
            <Linea
              key={a.id}
              etiqueta={a.cantidad > 1 ? `${a.nombre} × ${a.cantidad}` : a.nombre}
              valor={pesos(a.subtotal)}
            />
          ))}

          {/* Se muestra como línea propia y con su nombre: un recargo que
              aparece sin explicación es un reclamo asegurado. */}
          {cotizacion.recargo_edad && (
            <Linea
              etiqueta={cotizacion.recargo_edad.nombre}
              valor={pesos(cotizacion.recargo_edad.monto)}
            />
          )}

          <div className="flex items-end justify-between border-t border-border pt-3">
            <span className="font-semibold text-foreground">Total</span>
            <div className="text-right">
              {cotizacion.total_referencia &&
                cotizacion.total_referencia > cotizacion.total && (
                  <p className="text-xs text-muted-foreground line-through">
                    {pesos(cotizacion.total_referencia)}
                  </p>
                )}
              <p className="text-xl font-bold leading-tight text-[#1B3F6B]">
                {pesos(cotizacion.total)}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Impuestos incluidos. El combustible y los peajes van por tu cuenta.
          </p>
        </div>
      )}
    </aside>
  );
}

function Dato({
  icono: Icono, titulo, valor,
}: { icono: typeof MapPin; titulo: string; valor: string }) {
  return (
    <div className="flex gap-2.5">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{titulo}</dt>
        <dd className="font-medium text-foreground">{valor}</dd>
      </div>
    </div>
  );
}

function Linea({
  etiqueta, valor, acento,
}: { etiqueta: string; valor: string; acento?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="min-w-0 text-muted-foreground">{etiqueta}</span>
      <span
        className={
          acento
            ? "shrink-0 font-medium text-[hsl(var(--ubicar-green))]"
            : "shrink-0 text-foreground"
        }
      >
        {valor}
      </span>
    </div>
  );
}
