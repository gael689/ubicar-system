"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, MessageCircle, ShieldCheck, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError, pesos, fechaCorta } from "@/lib/api";
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
  holdToken: string | null;
  adicionales: { adicional_id: number; cantidad: number }[];
  /** Sin credenciales de Mercado Pago se cierra por WhatsApp. Lo dice el backend. */
  cobroOnline: boolean;
  /** D-30: descuento por pagar el 100%. 0 = sin descuento. */
  descuentoPagoTotalPct: number;
}

/**
 * Pago y confirmación.
 *
 * **Dos caminos según haya o no credenciales de Mercado Pago cargadas**, y la
 * decisión la toma el backend (`config.cobro_online`), no una variable del
 * front: la que sabe es la instancia que tiene las credenciales.
 *
 * Con cobro online, `POST /public/reservas` crea la reserva en
 * `pendiente_pago` y devuelve la URL de Checkout Pro. **La reserva no queda
 * confirmada al volver acá**: se confirma en el webhook, que es la fuente de
 * verdad, porque el cliente puede cerrar la pestaña y el pago igual entra.
 *
 * Sin cobro online se cierra por WhatsApp con todo pre-cargado, que es lo que
 * venía funcionando: el negocio recibe una consulta con vehículo, fechas,
 * adicionales y total definidos en vez de un "hola, quiero un auto".
 */
export function Paso4Pago({
  rango,
  categoriaNombre,
  cotizacion,
  cliente,
  holdToken,
  adicionales,
  cobroOnline,
  descuentoPagoTotalPct,
}: Props) {
  const router = useRouter();
  const [pct, setPct] = useState<number>(30);
  const [yendoAPagar, setYendoAPagar] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  // El descuento aplica sólo al pago total (D-30): una seña parcial no elimina
  // la cobranza en el mostrador, que es lo que se está pagando con el margen.
  const descuento =
    pct === 100 && descuentoPagoTotalPct > 0
      ? Math.round((cotizacion.total * descuentoPagoTotalPct) / 100)
      : 0;
  const totalFinal = cotizacion.total - descuento;
  const senia = pct === 100 ? totalFinal : Math.round((totalFinal * pct) / 100);
  const saldo = totalFinal - senia;

  // El monto que se cobra lo recalcula el backend. Estos números son sólo
  // para mostrar: si difirieran, manda el del servidor.
  const irAPagar = async () => {
    if (!holdToken) {
      setErrorPago("Se venció el tiempo de la reserva. Volvé a elegir el vehículo.");
      return;
    }
    setYendoAPagar(true);
    setErrorPago(null);
    try {
      const r = await api.crearReserva({
        hold_token: holdToken,
        nombre: `${cliente.nombre} ${cliente.apellido}`.trim(),
        email: cliente.email,
        telefono: cliente.telefono,
        dni: cliente.dni,
        lugar_entrega: rango.lugarRetiro,
        lugar_devolucion: rango.lugarDevolucion,
        porcentaje_anticipo: pct,
        adicionales,
        fecha_nacimiento: cliente.fechaNacimiento || null,
      });
      // Salida del sitio hacia Checkout Pro.
      window.location.href = r.init_point;
    } catch (e) {
      setYendoAPagar(false);
      setErrorPago(
        e instanceof ApiError
          ? e.message
          : "No pudimos abrir el pago. Probá de nuevo o escribinos por WhatsApp.",
      );
    }
  };

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
          const desc =
            o.pct === 100 && descuentoPagoTotalPct > 0
              ? Math.round((cotizacion.total * descuentoPagoTotalPct) / 100)
              : 0;
          const monto =
            o.pct === 100
              ? cotizacion.total - desc
              : Math.round(((cotizacion.total - desc) * o.pct) / 100);
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
              <p className="text-xs text-muted-foreground">
                {desc > 0 ? `${descuentoPagoTotalPct}% de descuento` : o.bajada}
              </p>
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
          {descuento > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Descuento por pago total ({descuentoPagoTotalPct}%)
              </span>
              <span className="font-medium text-[hsl(var(--ubicar-green))]">
                −{pesos(descuento)}
              </span>
            </div>
          )}
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

      {cobroOnline ? (
        <div className="space-y-3">
          {errorPago && (
            <div className="rounded-lg border border-destructive bg-destructive p-4 text-sm text-destructive-foreground">
              {errorPago}
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={yendoAPagar || !holdToken}
            onClick={irAPagar}
          >
            {yendoAPagar ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Abriendo el pago…
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" /> Pagar {pesos(senia)} con Mercado Pago
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Te llevamos a Mercado Pago para completar el pago de forma segura.
            {saldo > 0 && ` El saldo de ${pesos(saldo)} lo abonás al retirar el vehículo.`}
          </p>

          {/* El WhatsApp no desaparece: si el pago falla, la venta no se
              pierde por no tener a dónde ir. */}
          <button
            type="button"
            className="mx-auto block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => window.open(whatsappLink(mensaje), "_blank", "noopener,noreferrer")}
          >
            ¿Preferís coordinarlo por WhatsApp?
          </button>
        </div>
      ) : (
        /* Honestidad sobre el estado real: no se simula un pago que no existe. */
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
      )}

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
