"use client";

import { useEffect, useState } from "react";
import { Shield, Check, Minus, Plus, PackagePlus } from "lucide-react";
import { api, pesos } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Adicional } from "@/lib/types";

interface Props {
  seleccion: Record<number, number>;
  dias: number;
  onCambiar: (seleccion: Record<number, number>) => void;
}

/**
 * Coberturas y extras. **Los carga el admin**, no están en el código.
 *
 * Las coberturas son excluyentes (se elige UNA) y los extras acumulables. Esa
 * diferencia se ve en la interfaz —radio vs. contador— antes de que el cliente
 * tenga que descubrirla probando.
 *
 * La franquicia se muestra en la tarjeta y no escondida en la descripción: es
 * el motivo #1 de conflictos post-siniestro, y explicarla acá es lo que
 * convierte la cobertura de un costo en una venta.
 */
export function Paso2Adicionales({ seleccion, dias, onCambiar }: Props) {
  const [items, setItems] = useState<Adicional[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adicionales().then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg bg-destructive px-4 py-3 text-sm text-destructive-foreground">
        {error}
      </div>
    );
  }
  if (!items) return <Esqueleto />;

  const coberturas = items.filter((a) => a.grupo === "cobertura");
  const extras = items.filter((a) => a.grupo === "extra");

  const elegirCobertura = (id: number) => {
    const limpio = { ...seleccion };
    coberturas.forEach((c) => delete limpio[c.id]);
    if (!seleccion[id]) limpio[id] = 1; // volver a tocar la elegida la saca
    onCambiar(limpio);
  };

  const setCantidad = (a: Adicional, cantidad: number) => {
    const tope = a.max_cantidad ?? 99;
    const valor = Math.max(0, Math.min(cantidad, tope));
    const nuevo = { ...seleccion };
    if (valor === 0) delete nuevo[a.id];
    else nuevo[a.id] = valor;
    onCambiar(nuevo);
  };

  const precioTexto = (a: Adicional) =>
    a.precio === 0
      ? "Incluido"
      : `${pesos(a.precio)}${a.unidad_cobro === "por_dia" ? " por día" : ""}`;

  const totalItem = (a: Adicional, cant: number) =>
    a.precio * cant * (a.unidad_cobro === "por_dia" ? dias : 1);

  return (
    <div className="space-y-8">
      {coberturas.length > 0 && (
        <section>
          <Encabezado
            icono={Shield}
            titulo="Protección"
            bajada="Elegí una. Es lo que define cuánto pagás vos si algo pasa."
          />
          <div className="mt-4 grid gap-3">
            {coberturas.map((c) => {
              const activa = Boolean(seleccion[c.id]);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => elegirCobertura(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border bg-white p-4 text-left transition-all",
                    activa
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 hover:shadow-sm",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      activa ? "border-primary bg-primary" : "border-muted-foreground/40",
                    )}
                  >
                    {activa && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold text-[#1B3F6B]">{c.nombre}</span>
                      <span className="text-sm font-semibold text-foreground">
                        {precioTexto(c)}
                      </span>
                    </span>
                    {c.descripcion && (
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {c.descripcion}
                      </span>
                    )}
                    {c.franquicia !== null && (
                      <span className="mt-2 block rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                        Si hay un siniestro, tu responsabilidad máxima es de{" "}
                        <strong className="text-foreground">{pesos(c.franquicia)}</strong>
                      </span>
                    )}
                    {activa && c.precio > 0 && (
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {dias} {dias === 1 ? "día" : "días"} ={" "}
                        <strong className="text-foreground">
                          {pesos(totalItem(c, 1))}
                        </strong>
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {extras.length > 0 && (
        <section>
          <Encabezado
            icono={PackagePlus}
            titulo="Extras"
            bajada="Sumá lo que necesites para el viaje."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {extras.map((a) => {
              const cant = seleccion[a.id] ?? 0;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors",
                    cant > 0 ? "border-primary/50" : "border-border",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#1B3F6B]">{a.nombre}</p>
                    {a.descripcion && (
                      <p className="text-xs text-muted-foreground">{a.descripcion}</p>
                    )}
                    <p className="mt-1 text-sm text-foreground">{precioTexto(a)}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 rounded-md border border-border">
                    <BotonCantidad
                      onClick={() => setCantidad(a, cant - 1)}
                      disabled={cant === 0}
                      aria-label={`Quitar ${a.nombre}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </BotonCantidad>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">
                      {cant}
                    </span>
                    <BotonCantidad
                      onClick={() => setCantidad(a, cant + 1)}
                      disabled={a.max_cantidad !== null && cant >= a.max_cantidad}
                      aria-label={`Agregar ${a.nombre}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </BotonCantidad>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {coberturas.length === 0 && extras.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No hay adicionales cargados todavía. Podés seguir sin agregar nada.
        </p>
      )}
    </div>
  );
}

function Encabezado({
  icono: Icono, titulo, bajada,
}: { icono: typeof Shield; titulo: string; bajada: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icono className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <h2 className="font-semibold text-[#1B3F6B]">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{bajada}</p>
      </div>
    </div>
  );
}

function BotonCantidad({
  children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="grid h-8 w-8 place-items-center text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}
