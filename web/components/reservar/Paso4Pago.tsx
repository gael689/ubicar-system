"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, MessageCircle, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pesos, fechaCorta } from "@/lib/api";
import { whatsappLink } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Cotizacion, DatosCliente } from "@/lib/types";
import type { RangoBusqueda } from "./BuscadorRango";

/** D-30: el cliente elige cuánto adelanta, con un piso del 30%. */
const OPCIONES_SENA = [
  { pct: 30, label: "30%", bajada: "El mínimo para reservar" },
  { pct: 50, label: "50%", bajada: "Adelantás la mitad" },
  { pct: 100, label: "100%", bajada: "Pagás todo ahora" },
] as const;

interface Props {
  rango: RangoBusqueda;
  categoriaNombre: string;
  cotizacion: Cotizacion;
  cliente: DatosCliente;
}

/**
 * Pago y confirmación.
 *
 * **Mercado Pago todavía no está integrado** (ítem 62 del plan: depende de una
 * API externa y de las decisiones #4 y #5). Hasta que entre, el flujo no
 * simula un pago que no existe: muestra el resumen completo y cierra por
 * WhatsApp con todo pre-cargado.
 *
 * Eso ya es una mejora concreta sobre lo que había: el negocio recibe una
 * consulta con vehículo, fechas, adicionales y total definidos en vez de un
 * "hola, quiero un auto".
 */
export function Paso4Pago({ rango, categoriaNombre, cotizacion, cliente }: Props) {
  const router = useRouter();
  const [pct, setPct] = useState<number>(30);

  const senia = Math.round((cotizacion.total * pct) / 100);
  const saldo = cotizacion.total - senia;

  const mensaje = [
    "Hola! Quiero confirmar esta reserva:",
    "",
    `*Vehículo:* ${categoriaNombre}`,
    `*Retiro:* ${fechaCorta(rango.fechaInicio)} ${rango.horaInicio} — ${rango.lugarRetiro}`,
    `*Devolución:* ${fechaCorta(rango.fechaFin)} ${rango.horaFin} — ${rango.lugarDevolucion}`,
    "",
    ...cotizacion.adicionales.map(
      (a) => `• ${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ""} — ${pesos(a.subtotal)}`,
    ),
    cotizacion.recargo_edad
      ? `• ${cotizacion.recargo_edad.nombre} — ${pesos(cotizacion.recargo_edad.monto)}`
      : "",
    "",
    `*Total:* ${pesos(cotizacion.total)}`,
    `*Quiero adelantar:* ${pct}% (${pesos(senia)})`,
    "",
    `*Mis datos:* ${cliente.nombre} ${cliente.apellido} — DNI ${cliente.dni}`,
    `${cliente.email} — ${cliente.telefono}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2.5">
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold text-[#1B3F6B]">Confirmá tu reserva</h2>
          <p className="text-sm text-muted-foreground">
            Elegí cuánto querés adelantar. El resto se abona al retirar el vehículo.
          </p>
        </div>
      </div>

      {/* Cuánto adelanta (D-30) */}
      <div className="grid gap-3 sm:grid-cols-3">
        {OPCIONES_SENA.map((o) => {
          const activa = pct === o.pct;
          const monto = Math.round((cotizacion.total * o.pct) / 100);
          return (
            <button
              key={o.pct}
              type="button"
              onClick={() => setPct(o.pct)}
              className={cn(
                "rounded-lg border bg-white p-4 text-left transition-all",
                activa
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:shadow-sm",
              )}
            >
              <p className="text-sm font-semibold text-[#1B3F6B]">{o.label}</p>
              <p className="text-lg font-bold text-foreground">{pesos(monto)}</p>
              <p className="text-xs text-muted-foreground">{o.bajada}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-white p-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total de la reserva</span>
            <span className="font-medium text-foreground">{pesos(cotizacion.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Adelantás ahora</span>
            <span className="font-semibold text-[#1B3F6B]">{pesos(senia)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-muted-foreground">Al retirar el vehículo</span>
            <span className="font-medium text-foreground">{pesos(saldo)}</span>
          </div>
        </div>
      </div>

      {/* Honestidad sobre el estado real: no se simula un pago que no existe. */}
      <div className="rounded-lg border border-border bg-muted/50 p-5">
        <div className="flex items-start gap-2.5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-3">
            <div>
              <p className="font-medium text-foreground">
                El pago online se está terminando de habilitar
              </p>
              <p className="text-sm text-muted-foreground">
                Mientras tanto cerramos la reserva por WhatsApp: te llega todo lo
                que elegiste ya cargado y coordinamos el pago en el momento.
              </p>
            </div>

            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => {
                window.open(whatsappLink(mensaje), "_blank", "noopener,noreferrer");
                // Llevarlo a la confirmación: si se queda en el checkout no
                // sabe si la reserva quedó hecha, y vuelve a escribir.
                router.push("/reservar/listo");
              }}
            >
              <MessageCircle className="h-4 w-4" /> Confirmar por WhatsApp
            </Button>
          </div>
        </div>
      </div>

      <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--ubicar-green))]" />
          Kilometraje libre incluido
        </li>
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--ubicar-green))]" />
          Seguro de responsabilidad civil incluido
        </li>
      </ul>
    </div>
  );
}
