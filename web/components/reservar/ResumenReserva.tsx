"use client";

import { CalendarDays, MapPin, Car } from "lucide-react";
import { pesos, fechaCorta } from "@/lib/api";
import { nombreLugar } from "@/lib/lugares";
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
  // La opción de pagar el 100%, tal como la calculó el backend. Acá no se
  // calcula ningún precio: el ahorro y el total ya vienen resueltos por el
  // mismo motor que después cobra.
  const pagoTotal = cotizacion?.anticipos?.find((a) => a.porcentaje === 100);
  const ahorroPagandoTodo = pagoTotal?.ahorro ?? 0;

  return (
    <aside className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-[#1B3F6B]">Tu reserva</h2>

      <dl className="mt-4 space-y-3 text-sm">
        {/* `nombreLugar`: el centinela `__otro__` no se muestra nunca — llegó
            a verse acá, donde tenía que decir el punto que la persona pidió. */}
        <Dato
          icono={MapPin}
          titulo="Retiro"
          valor={nombreLugar(rango.lugarRetiro, rango.lugarRetiroOtro) || "—"}
        />
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
          {/* El recargo por edad va **dentro** de la línea del alquiler, no
              aparte. La cuenta cierra igual —el descuento sigue calculándose
              sobre el subtotal, así que alquiler + recargo − descuento +
              adicionales da el mismo total—, y el cliente ve el precio de su
              alquiler en vez de una línea que lo etiqueta por su edad. El
              backend sigue devolviendo el desglose completo: la reserva, el
              contrato y la caja lo necesitan. */}
          <Linea
            etiqueta={`Alquiler · ${cotizacion.duracion_dias} ${cotizacion.duracion_dias === 1 ? "día" : "días"}`}
            valor={pesos(cotizacion.subtotal + (cotizacion.recargo_edad?.monto ?? 0))}
          />

          {/* El descuento por duración. Se muestra cuando **efectivamente se
              está aplicando**, o sea cuando el cliente eligió pagar el 100%
              (D-49): listarlo antes sería anunciar una rebaja que todavía no
              tiene. Lo que falta —que exista y no la esté aprovechando— se
              cuenta abajo, con el ahorro en plata. */}
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

          <div className="flex items-end justify-between border-t border-border pt-3">
            <span className="font-semibold text-foreground">Total</span>
            <div className="text-right">
              {(() => {
                // El mismo criterio que la grilla del paso 1: si el descuento
                // por pago total está corriendo, el tachado es el precio de
                // lista —que es lo que paga quien seña parcial, un número
                // real—; si no, el tachado es el de referencia de la promo de
                // calendario. Nunca los dos, porque dos precios tachados en la
                // misma línea no se leen.
                const tachado =
                  cotizacion.total_lista > cotizacion.total
                    ? cotizacion.total_lista
                    : cotizacion.total_referencia &&
                        cotizacion.total_referencia > cotizacion.total
                      ? cotizacion.total_referencia
                      : null;
                return tachado ? (
                  <p className="text-xs text-muted-foreground line-through">
                    {pesos(tachado)}
                  </p>
                ) : null;
              })()}
              <p className="text-xl font-bold leading-tight text-[#1B3F6B]">
                {pesos(cotizacion.total)}
              </p>
            </div>
          </div>

          {/* Promoción de calendario: si el precio de estos días es promocional,
              se dice cuál. Un total más bajo sin explicación se lee como un
              error de la web, no como una oferta. */}
          {cotizacion.tiene_promocion && cotizacion.promociones.length > 0 && (
            <p className="text-xs font-semibold text-[hsl(var(--ubicar-green))]">
              {cotizacion.promociones.join(" · ")}
            </p>
          )}

          {/* El descuento que existe y todavía no está aprovechando. Va acá,
              en la columna que acompaña todo el flujo, y no sólo en el paso 4:
              enterarse de que pagando el total se ahorra plata recién en el
              checkout llega tarde. **En pesos**, que es como se decide. */}
          {cotizacion.descuento_monto === 0 && ahorroPagandoTodo > 0 && (
            <p className="rounded border border-[hsl(var(--ubicar-green))]/30 bg-[hsl(var(--ubicar-green))]/5 px-2.5 py-2 text-xs text-muted-foreground">
              Pagando el 100% por adelantado{" "}
              <strong className="text-[hsl(var(--ubicar-green))]">
                ahorrás {pesos(ahorroPagandoTodo)}
              </strong>{" "}
              — te queda en {pesos(pagoTotal?.total)}.
            </p>
          )}

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
